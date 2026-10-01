import express from "express";
import cors from "cors";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { requireWorkflowSecret } from "./auth";
import {
  serializeIdea,
  serializeCronRun,
  serializeTrendSnapshot,
  type IdeaRow,
  type CronRunRow,
  type CompetitorRow,
  type TrendSnapshotRow,
} from "./db";
import {
  ideaBatchRequestSchema,
  ideaPatchSchema,
  settingsPatchSchema,
  cronRunPatchSchema,
  triggerWorkflowSchema,
  reevaluationSchema,
  competitorsSubmitSchema,
  trendSnapshotsSubmitSchema,
  SOURCE_SETTING_KEYS,
} from "./schema";

interface Env {
  DB: D1Database;
  WEB_ORIGIN: string;
  GH_WORKFLOW_DISPATCH_TOKEN?: string;
}

const GITHUB_REPO = "utkualbayrak/app-idea-factory";

const app = express();

// UI (apps/web) ve API farklı subdomain'lerde (Cloudflare Access session
// cookie'si de her ikisi için ayrı) — tarayıcıdan doğrudan çağrılabilmesi
// için CORS gerekiyor. docs/PROJE.md mimarisi UI<->API'nin doğrudan
// konuştuğunu varsayıyor (proxy yok).
// WEB_ORIGIN virgülle ayrılmış birden fazla origin içerebilir (örn. workers.dev
// adresi + özel domain) — istek origini listede varsa aynen yansıtılır.
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = (env as unknown as Env).WEB_ORIGIN.split(",").map((o) => o.trim());
      callback(null, origin != null && allowed.includes(origin) ? origin : allowed[0]);
    },
    credentials: true,
  }),
);
app.use(express.json());

function db() {
  return (env as unknown as Env).DB;
}

app.get("/health", async (_req, res) => {
  const result = await db().prepare("SELECT 1 AS ok").first<{ ok: number }>();
  res.json({ status: "ok", db: result?.ok === 1 });
});

app.get("/ideas", async (req, res) => {
  // 'deleted' durumu listeden tamamen gizlenir (bkz. docs/PROJE.md "Kesinleşen
  // kararlar"); id üzerinden doğrudan erişim (GET /ideas/:id) hâlâ mümkün.
  const batchDate = typeof req.query.batch_date === "string" ? req.query.batch_date : undefined;

  const { results } = batchDate
    ? await db()
        .prepare(
          "SELECT * FROM ideas WHERE batch_date = ?1 AND status != 'deleted' ORDER BY created_at DESC",
        )
        .bind(batchDate)
        .all<IdeaRow>()
    : await db()
        .prepare("SELECT * FROM ideas WHERE status != 'deleted' ORDER BY created_at DESC")
        .all<IdeaRow>();

  res.json({ ideas: results.map(serializeIdea) });
});

app.get("/ideas/recent-names", requireWorkflowSecret, async (req, res) => {
  const days = Number(req.query.days ?? 90);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 90;

  // created_at ISO formatında (T/Z'li) yazılıyor; datetime('now', ...) ise
  // boşluklu format döndürüyor — string karşılaştırması bozulmasın diye
  // eşik değeri de ISO'ya çevrilip bağlanıyor.
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await db()
    .prepare(`SELECT name, one_liner, category FROM ideas WHERE created_at >= ?1 ORDER BY created_at DESC`)
    .bind(since)
    .all<{ name: string; one_liner: string; category: string }>();

  // names: geriye dönük uyumluluk + isim tekrarı kontrolü (validate-ideas.ts).
  // ideas: prompts/daily-ideas.md'nin konsept tekrarını önlemek için okuduğu liste.
  res.json({ names: [...new Set(results.map((row) => row.name))], ideas: results });
});

app.get("/ideas/:id", async (req, res) => {
  const row = await db()
    .prepare("SELECT * FROM ideas WHERE id = ?1")
    .bind(req.params.id)
    .first<IdeaRow>();

  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ idea: serializeIdea(row) });
});

app.post("/ideas/batch", requireWorkflowSecret, async (req, res) => {
  const parsed = ideaBatchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { batch_date, ideas } = parsed.data;
  const now = new Date().toISOString();

  const statements = ideas.map((idea) =>
    db()
      .prepare(
        `INSERT INTO ideas
          (id, created_at, batch_date, name, one_liner, problem, target_audience,
           core_features, monetization, category, inspiration_sources, tags, scores, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'new')`,
      )
      .bind(
        crypto.randomUUID(),
        now,
        batch_date,
        idea.name,
        idea.one_liner,
        idea.problem,
        idea.target_audience,
        JSON.stringify(idea.core_features),
        idea.monetization,
        idea.category,
        JSON.stringify(idea.inspiration_sources),
        JSON.stringify(idea.tags),
        JSON.stringify(idea.scores),
      ),
  );

  await db().batch(statements);

  const { results } = await db()
    .prepare("SELECT * FROM ideas WHERE batch_date = ?1 ORDER BY created_at DESC LIMIT ?2")
    .bind(batch_date, ideas.length)
    .all<IdeaRow>();

  res.status(201).json({ ideas: results.map(serializeIdea) });
});

app.patch("/ideas/:id", async (req, res) => {
  const parsed = ideaPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const existing = await db()
    .prepare("SELECT * FROM ideas WHERE id = ?1")
    .bind(req.params.id)
    .first<IdeaRow>();

  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const now = new Date().toISOString();
  const next = { ...existing, ...parsed.data };
  // user_note her değiştiğinde (boşa çekilse bile) güncelleme zamanı damgalanır.
  const userNoteChanged = Object.hasOwn(parsed.data, "user_note");
  const userNoteUpdatedAt = userNoteChanged ? now : existing.user_note_updated_at;

  await db()
    .prepare(
      `UPDATE ideas SET user_rating = ?1, user_note = ?2, user_note_updated_at = ?3, status = ?4 WHERE id = ?5`,
    )
    .bind(
      next.user_rating ?? null,
      next.user_note ?? null,
      userNoteUpdatedAt,
      next.status,
      req.params.id,
    )
    .run();

  res.json({ idea: serializeIdea({ ...next, user_note_updated_at: userNoteUpdatedAt } as IdeaRow) });
});

// Grup 3: ayarlar ekranı (kaynak aç/kapat + manuel cron tetikleme).
// Workflow da aynı uçtan okur (collect-trends.ts başlamadan önce hangi
// kaynakların atlanacağını öğrenmek için) — ayarlar hassas veri değil,
// GET burada workflow-secret istemiyor, Access + CORS yeterli.
app.get("/admin/settings", async (_req, res) => {
  const { results } = await db()
    .prepare("SELECT key, value FROM app_settings")
    .all<{ key: string; value: string }>();
  const stored = new Map(results.map((row) => [row.key, row.value === "true"]));

  // DB'de hiç satırı olmayan bir kaynak varsayılan olarak etkin kabul edilir.
  const settings = Object.fromEntries(SOURCE_SETTING_KEYS.map((key) => [key, stored.get(key) ?? true]));
  res.json({ settings });
});

app.patch("/admin/settings", async (req, res) => {
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const now = new Date().toISOString();
  await db()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3`,
    )
    .bind(parsed.data.key, String(parsed.data.value), now)
    .run();

  res.json({ ok: true });
});

// GitHub'ın workflow_dispatch API'sini tetikler — manuel "cron'u şimdi
// çalıştır", "yeniden değerlendir" ve "rakipleri bul" butonlarının hepsi
// aynı mekanizmayı kullanıyor, tek uç. GH_WORKFLOW_DISPATCH_TOKEN,
// 'workflow' scope'lu bir PAT — Worker secret olarak eklenmesi gerekiyor
// (bkz. CLAUDE.md).
app.post("/admin/trigger-workflow", async (req, res) => {
  const parsed = triggerWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (!GH_WORKFLOW_DISPATCH_TOKEN) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${parsed.data.workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_WORKFLOW_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "app-idea-factory-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: parsed.data.inputs ?? {} }),
    },
  );

  if (!ghRes.ok) {
    res.status(502).json({ error: "github_dispatch_failed", status: ghRes.status });
    return;
  }

  res.status(202).json({ ok: true });
});

// Grup 3: cron geçmişi ekranı.
app.get("/admin/cron-runs", async (req, res) => {
  const limit = Number(req.query.limit ?? 30);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 30;

  const { results } = await db()
    .prepare("SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT ?1")
    .bind(safeLimit)
    .all<CronRunRow>();

  res.json({ runs: results.map(serializeCronRun) });
});

app.post("/admin/cron-runs", requireWorkflowSecret, async (_req, res) => {
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO cron_runs (id) VALUES (?1)").bind(id).run();
  res.status(201).json({ id });
});

app.patch("/admin/cron-runs/:id", requireWorkflowSecret, async (req, res) => {
  const parsed = cronRunPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const now = new Date().toISOString();
  await db()
    .prepare(
      `UPDATE cron_runs SET status = ?1, finished_at = ?2, source_breakdown = ?3, error = ?4 WHERE id = ?5`,
    )
    .bind(
      parsed.data.status,
      now,
      parsed.data.source_breakdown ? JSON.stringify(parsed.data.source_breakdown) : null,
      parsed.data.error ?? null,
      req.params.id,
    )
    .run();

  res.json({ ok: true });
});

// Grup 4: notlarla yeniden değerlendirme sonucunu yazar, last_reevaluated_at'i damgalar.
app.patch("/admin/ideas/:id/reevaluate", requireWorkflowSecret, async (req, res) => {
  const parsed = reevaluationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const existing = await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(req.params.id).first<IdeaRow>();
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const now = new Date().toISOString();
  const tags = parsed.data.tags ? JSON.stringify(parsed.data.tags) : existing.tags;

  const summary = parsed.data.change_summary;

  await db()
    .prepare(
      `UPDATE ideas SET scores = ?1, tags = ?2, last_reevaluated_at = ?3, last_reevaluation_summary = ?4 WHERE id = ?5`,
    )
    .bind(JSON.stringify(parsed.data.scores), tags, now, summary, req.params.id)
    .run();

  res.json({
    idea: serializeIdea({
      ...existing,
      scores: JSON.stringify(parsed.data.scores),
      tags,
      last_reevaluated_at: now,
      last_reevaluation_summary: summary,
    }),
  });
});

// Grup 4: rakip/benzer uygulamalar. Her "rakipleri bul" çalışması o fikrin
// önceki sonuçlarının yerine geçer (tekrar tekrar biriktirmesin diye).
app.get("/ideas/:id/competitors", async (req, res) => {
  const { results } = await db()
    .prepare("SELECT * FROM idea_competitors WHERE idea_id = ?1 ORDER BY rowid")
    .bind(req.params.id)
    .all<CompetitorRow>();
  res.json({ competitors: results });
});

app.post("/admin/competitors", requireWorkflowSecret, async (req, res) => {
  const parsed = competitorsSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { idea_id, competitors } = parsed.data;
  const statements = [
    db().prepare("DELETE FROM idea_competitors WHERE idea_id = ?1").bind(idea_id),
    ...competitors.map((c) =>
      db()
        .prepare(
          `INSERT INTO idea_competitors (id, idea_id, app_name, url, similarity, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(crypto.randomUUID(), idea_id, c.app_name, c.url, c.similarity, c.note),
    ),
  ];
  await db().batch(statements);

  res.status(201).json({ ok: true, count: competitors.length });
});

// Grup 4: trend_snapshots'ın gerçekten kullanılması — 24 saatten eski
// kayıtlar her yeni yazımda temizlenir (ayrı bir cleanup adımı/endpoint'i
// gerekmiyor).
app.post("/admin/trend-snapshots", requireWorkflowSecret, async (req, res) => {
  const parsed = trendSnapshotsSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const statements = [
    db().prepare(`DELETE FROM trend_snapshots WHERE fetched_at < datetime('now', '-24 hours')`),
    ...parsed.data.snapshots.map((s) =>
      db()
        .prepare(`INSERT INTO trend_snapshots (id, source, payload, cron_run_id) VALUES (?1, ?2, ?3, ?4)`)
        .bind(crypto.randomUUID(), s.source, JSON.stringify(s.payload), parsed.data.cron_run_id ?? null),
    ),
  ];
  await db().batch(statements);

  res.status(201).json({ ok: true, count: parsed.data.snapshots.length });
});

// collect-trends.ts'in yavaş değişen bir kaynağı (örn. App Store) son 24
// saat içinde zaten toplanmışsa tekrar çekmeyip bu kaydı yeniden kullanması için.
app.get("/admin/trend-snapshots/latest", requireWorkflowSecret, async (req, res) => {
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  if (!source) {
    res.status(400).json({ error: "source_required" });
    return;
  }

  const row = await db()
    .prepare(
      `SELECT * FROM trend_snapshots WHERE source = ?1 AND fetched_at >= datetime('now', '-24 hours')
       ORDER BY fetched_at DESC LIMIT 1`,
    )
    .bind(source)
    .first<TrendSnapshotRow>();

  res.json({ snapshot: row ? serializeTrendSnapshot(row) : null });
});

// Cron Geçmişi ekranından bir çalışmanın hangi öğeleri topladığını görmek için.
app.get("/admin/trend-snapshots", async (req, res) => {
  const cronRunId = typeof req.query.cron_run_id === "string" ? req.query.cron_run_id : undefined;
  if (!cronRunId) {
    res.status(400).json({ error: "cron_run_id_required" });
    return;
  }

  const { results } = await db()
    .prepare("SELECT * FROM trend_snapshots WHERE cron_run_id = ?1 ORDER BY source")
    .bind(cronRunId)
    .all<TrendSnapshotRow>();

  res.json({ snapshots: results.map(serializeTrendSnapshot) });
});

export default app;
