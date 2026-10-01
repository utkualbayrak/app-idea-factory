import express from "express";
import cors from "cors";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { requireWorkflowSecret } from "./auth";
import {
  serializeIdea,
  serializeCronRun,
  serializeTrendSnapshot,
  serializeCompetitor,
  serializeTask,
  serializeTaskDocument,
  type IdeaRow,
  type TaskRow,
  type TaskDocumentRow,
  type CronRunRow,
  type CompetitorRow,
  type TrendSnapshotRow,
  type WorkflowRunRow,
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
  workflowRunPatchSchema,
  workflowRunCreateSchema,
  taskCreateSchema,
  taskDocumentsSubmitSchema,
  DOCUMENT_KINDS,
  TASK_REPLANNABLE_STATUSES,
  SOURCE_SETTING_KEYS,
  IDEA_WORKFLOWS,
  WORKFLOW_ACTIVITY,
  type ActivityKind,
  type IdeaWorkflow,
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
// 1mb: planlama belgeleri (4 Markdown dosyası) express'in 100kb varsayılanını
// aşabilir.
app.use(express.json({ limit: "1mb" }));

function db() {
  return (env as unknown as Env).DB;
}

function isIdeaWorkflow(workflow: string): workflow is IdeaWorkflow {
  return (IDEA_WORKFLOWS as readonly string[]).includes(workflow);
}

// Fikir listesindeki aktivite rozeti için (2. tur Grup C).
function stampActivity(ideaId: string, kind: ActivityKind, at: string) {
  return db()
    .prepare("UPDATE ideas SET last_activity_at = ?1, last_activity_kind = ?2 WHERE id = ?3")
    .bind(at, kind, ideaId);
}

// GitHub'ın workflow_dispatch API'si. GH_WORKFLOW_DISPATCH_TOKEN, 'workflow'
// scope'lu bir PAT — Worker secret olarak eklenmesi gerekiyor (bkz. CLAUDE.md).
async function dispatchWorkflow(token: string, workflow: string, inputs: Record<string, string>) {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "app-idea-factory-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });
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
  const { mark_seen: markSeen, ...fields } = parsed.data;
  const next = { ...existing, ...fields };
  // user_note her değiştiğinde (boşa çekilse bile) güncelleme zamanı damgalanır.
  const userNoteChanged = Object.hasOwn(fields, "user_note");
  const userNoteUpdatedAt = userNoteChanged ? now : existing.user_note_updated_at;

  // Aktivite rozeti: istekteki en "anlamlı" değişiklik damgalanır. mark_seen
  // tek başına geldiyse (detay sayfası açıldı) aktivite değişmez.
  let activityKind: ActivityKind | null = null;
  if (Object.hasOwn(fields, "status") && fields.status !== existing.status) activityKind = "status_changed";
  else if (userNoteChanged) activityKind = "note_updated";
  else if (Object.hasOwn(fields, "user_rating") && fields.user_rating !== existing.user_rating)
    activityKind = "rating_updated";

  const lastActivityAt = activityKind ? now : existing.last_activity_at;
  const lastActivityKind = activityKind ?? existing.last_activity_kind;
  const activitySeenAt = markSeen ? now : existing.activity_seen_at;

  await db()
    .prepare(
      `UPDATE ideas SET user_rating = ?1, user_note = ?2, user_note_updated_at = ?3, status = ?4,
         last_activity_at = ?5, last_activity_kind = ?6, activity_seen_at = ?7
       WHERE id = ?8`,
    )
    .bind(
      next.user_rating ?? null,
      next.user_note ?? null,
      userNoteUpdatedAt,
      next.status,
      lastActivityAt,
      lastActivityKind,
      activitySeenAt,
      req.params.id,
    )
    .run();

  res.json({
    idea: serializeIdea({
      ...next,
      user_note_updated_at: userNoteUpdatedAt,
      last_activity_at: lastActivityAt,
      last_activity_kind: lastActivityKind,
      activity_seen_at: activitySeenAt,
    } as IdeaRow),
  });
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
// aynı mekanizmayı kullanıyor, tek uç.
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

  const { workflow } = parsed.data;
  const inputs: Record<string, string> = { ...parsed.data.inputs };
  const now = new Date().toISOString();

  // Fikir bazlı işler (yeniden değerlendirme, rakip bulma) Çalışma geçmişi
  // ekranında görünsün diye önce workflow_runs'a 'queued' satırı yazılır; id'si
  // workflow'a job_id input'u olarak geçer, workflow başlarken/biterken bu
  // satırı günceller (scripts/start-workflow-run.ts, finish-workflow-run.ts).
  let jobId: string | null = null;
  if (isIdeaWorkflow(workflow)) {
    const ideaId = inputs.idea_id;
    const idea = ideaId
      ? await db().prepare("SELECT id FROM ideas WHERE id = ?1").bind(ideaId).first<{ id: string }>()
      : null;
    if (!ideaId || !idea) {
      res.status(400).json({ error: "idea_id_required" });
      return;
    }

    jobId = crypto.randomUUID();
    inputs.job_id = jobId;
    await db().batch([
      db()
        .prepare("INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)")
        .bind(jobId, workflow, ideaId, now),
      stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][0], now),
    ]);
  }

  const ghRes = await dispatchWorkflow(GH_WORKFLOW_DISPATCH_TOKEN, workflow, inputs);

  if (!ghRes.ok) {
    if (jobId && isIdeaWorkflow(workflow)) {
      await db().batch([
        db()
          .prepare("UPDATE workflow_runs SET status = 'failed', finished_at = ?1, error = ?2 WHERE id = ?3")
          .bind(now, `GitHub tetikleme başarısız (HTTP ${ghRes.status})`, jobId),
        stampActivity(inputs.idea_id, WORKFLOW_ACTIVITY[workflow][2], now),
      ]);
    }
    res.status(502).json({ error: "github_dispatch_failed", status: ghRes.status });
    return;
  }

  res.status(202).json({ ok: true, job_id: jobId });
});

// 2. tur Grup C: fikir bazlı işlerin geçmişi (Çalışma geçmişi > Fikir işleri,
// gösterge paneli). Fikir adı JOIN ile gelir.
app.get("/admin/workflow-runs", async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50;
  const ideaId = typeof req.query.idea_id === "string" ? req.query.idea_id : undefined;

  const base = `SELECT w.*, i.name AS idea_name FROM workflow_runs w LEFT JOIN ideas i ON i.id = w.idea_id`;
  const { results } = ideaId
    ? await db()
        .prepare(`${base} WHERE w.idea_id = ?1 ORDER BY w.created_at DESC LIMIT ?2`)
        .bind(ideaId, safeLimit)
        .all<WorkflowRunRow>()
    : await db().prepare(`${base} ORDER BY w.created_at DESC LIMIT ?1`).bind(safeLimit).all<WorkflowRunRow>();

  res.json({ runs: results });
});

app.post("/admin/workflow-runs", requireWorkflowSecret, async (req, res) => {
  const parsed = workflowRunCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { workflow, idea_id: ideaId, run_url: runUrl } = parsed.data;
  const idea = await db().prepare("SELECT id FROM ideas WHERE id = ?1").bind(ideaId).first<{ id: string }>();
  if (!idea) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [
    db()
      .prepare(
        "INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at, started_at, run_url) VALUES (?1, ?2, ?3, 'running', ?4, ?4, ?5)",
      )
      .bind(id, workflow, ideaId, now, runUrl ?? null),
    stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][0], now),
  ];
  if (workflow === "plan-idea.yml") statements.push(markTaskPlanning(ideaId, now));
  await db().batch(statements);
  res.status(201).json({ id });
});

app.patch("/admin/workflow-runs/:id", requireWorkflowSecret, async (req, res) => {
  const parsed = workflowRunPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const run = await db()
    .prepare("SELECT * FROM workflow_runs WHERE id = ?1")
    .bind(req.params.id)
    .first<WorkflowRunRow>();
  if (!run) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const now = new Date().toISOString();
  const { status, run_url: runUrl, error } = parsed.data;

  if (status === "running") {
    const statements = [
      db()
        .prepare("UPDATE workflow_runs SET status = 'running', started_at = ?1, run_url = COALESCE(?2, run_url) WHERE id = ?3")
        .bind(now, runUrl ?? null, run.id),
    ];
    if (run.workflow === "plan-idea.yml") statements.push(markTaskPlanning(run.idea_id, now));
    await db().batch(statements);
  } else {
    const statements = [
      db()
        .prepare(
          "UPDATE workflow_runs SET status = ?1, finished_at = ?2, error = ?3, run_url = COALESCE(?4, run_url) WHERE id = ?5",
        )
        .bind(status, now, error ?? null, runUrl ?? null, run.id),
    ];
    if (isIdeaWorkflow(run.workflow)) {
      const [, okKind, failKind] = WORKFLOW_ACTIVITY[run.workflow];
      statements.push(stampActivity(run.idea_id, status === "success" ? okKind : failKind, now));
    }
    // Belge üretimi patladıysa görev 'planning_failed'e düşer (başarı yolunu
    // POST /admin/tasks/documents zaten 'ready' yapıyor).
    if (run.workflow === "plan-idea.yml" && status === "failed") {
      statements.push(
        db()
          .prepare(
            "UPDATE tasks SET status = 'planning_failed', error = ?1, updated_at = ?2 WHERE idea_id = ?3 AND status = 'planning'",
          )
          .bind(error ?? "Belge üretimi başarısız oldu.", now, run.idea_id),
      );
    }
    await db().batch(statements);
  }

  res.json({ ok: true });
});

// Faz 3A: "Geliştir" akışı. Görev formu kaydedilir, fikir
// 'awaiting_development' olur ve Claude'un planlama belgelerini yazdığı
// plan-idea.yml tetiklenir. Fikir başına tek görev: belgeleri yeniden üretmek
// (planning_failed / ready durumunda) aynı satırı günceller.

// Elle (job_id'siz) başlayan bir plan-idea.yml çalışması da görevi 'planning'e
// çeker — kilitli (iskelet aşamasındaki) görevlere dokunmaz.
function markTaskPlanning(ideaId: string, now: string) {
  return db()
    .prepare(
      "UPDATE tasks SET status = 'planning', error = NULL, updated_at = ?1 WHERE idea_id = ?2 AND status IN ('planning', 'planning_failed', 'ready')",
    )
    .bind(now, ideaId);
}

app.post("/tasks", async (req, res) => {
  const parsed = taskCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (!GH_WORKFLOW_DISPATCH_TOKEN) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const { idea_id: ideaId, params } = parsed.data;
  const idea = await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(ideaId).first<IdeaRow>();
  if (!idea) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const existing = await db().prepare("SELECT * FROM tasks WHERE idea_id = ?1").bind(ideaId).first<TaskRow>();
  if (existing && !TASK_REPLANNABLE_STATUSES.includes(existing.status)) {
    // planning: zaten üretiliyor; queued ve sonrası: iskelete geçildi, belgeler kilitli.
    res.status(409).json({ error: "task_locked", status: existing.status });
    return;
  }
  if (!existing && !["new", "on_hold"].includes(idea.status)) {
    res.status(409).json({ error: "invalid_idea_status", status: idea.status });
    return;
  }

  const now = new Date().toISOString();
  const taskId = existing?.id ?? crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const workflow = "plan-idea.yml";

  await db().batch([
    existing
      ? db()
          .prepare("UPDATE tasks SET params = ?1, status = 'planning', error = NULL, updated_at = ?2 WHERE id = ?3")
          .bind(JSON.stringify(params), now, taskId)
      : db()
          .prepare(
            "INSERT INTO tasks (id, idea_id, created_at, updated_at, params, status) VALUES (?1, ?2, ?3, ?3, ?4, 'planning')",
          )
          .bind(taskId, ideaId, now, JSON.stringify(params)),
    db()
      .prepare("UPDATE ideas SET status = 'awaiting_development' WHERE id = ?1")
      .bind(ideaId),
    db()
      .prepare("INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)")
      .bind(jobId, workflow, ideaId, now),
    stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][0], now),
  ]);

  const ghRes = await dispatchWorkflow(GH_WORKFLOW_DISPATCH_TOKEN, workflow, { idea_id: ideaId, job_id: jobId });
  if (!ghRes.ok) {
    const error = `GitHub tetikleme başarısız (HTTP ${ghRes.status})`;
    await db().batch([
      db()
        .prepare("UPDATE workflow_runs SET status = 'failed', finished_at = ?1, error = ?2 WHERE id = ?3")
        .bind(now, error, jobId),
      db()
        .prepare("UPDATE tasks SET status = 'planning_failed', error = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(error, now, taskId),
      stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][2], now),
    ]);
    res.status(502).json({ error: "github_dispatch_failed", status: ghRes.status });
    return;
  }

  const task = await db().prepare("SELECT * FROM tasks WHERE id = ?1").bind(taskId).first<TaskRow>();
  res.status(existing ? 200 : 201).json({ task: task ? serializeTask(task) : null });
});

// Fikrin görevi + belgeleri (detay sayfası). Workflow da (fetch-task.ts)
// Access service token ile buradan okur. Görev yoksa task: null.
app.get("/ideas/:id/task", async (req, res) => {
  const task = await db().prepare("SELECT * FROM tasks WHERE idea_id = ?1").bind(req.params.id).first<TaskRow>();
  if (!task) {
    res.json({ task: null, documents: [] });
    return;
  }

  const { results } = await db()
    .prepare("SELECT * FROM task_documents WHERE task_id = ?1")
    .bind(task.id)
    .all<TaskDocumentRow>();
  const order = (kind: string) => DOCUMENT_KINDS.indexOf(kind as (typeof DOCUMENT_KINDS)[number]);
  const documents = results.sort((a, b) => order(a.kind) - order(b.kind)).map(serializeTaskDocument);

  res.json({ task: serializeTask(task), documents });
});

// plan-idea.yml'ın ürettiği 4 belgeyi yazar (her üretim öncekilerin yerine
// geçer, kullanıcı düzenlemeleri dahil) ve görevi 'ready' yapar.
app.post("/admin/tasks/documents", requireWorkflowSecret, async (req, res) => {
  const parsed = taskDocumentsSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { idea_id: ideaId, documents } = parsed.data;
  const task = await db().prepare("SELECT * FROM tasks WHERE idea_id = ?1").bind(ideaId).first<TaskRow>();
  if (!task) {
    res.status(404).json({ error: "task_not_found" });
    return;
  }
  if (!["planning", ...TASK_REPLANNABLE_STATUSES].includes(task.status)) {
    res.status(409).json({ error: "task_locked", status: task.status });
    return;
  }

  const now = new Date().toISOString();
  await db().batch([
    db().prepare("DELETE FROM task_documents WHERE task_id = ?1").bind(task.id),
    ...DOCUMENT_KINDS.map((kind) =>
      db()
        .prepare("INSERT INTO task_documents (task_id, kind, content, generated_at) VALUES (?1, ?2, ?3, ?4)")
        .bind(task.id, kind, documents[kind], now),
    ),
    db()
      .prepare("UPDATE tasks SET status = 'ready', error = NULL, updated_at = ?1 WHERE id = ?2")
      .bind(now, task.id),
    // job_id'siz (elle) çalıştırılsa da rozet güncellensin.
    stampActivity(ideaId, "planned", now),
  ]);

  res.status(201).json({ ok: true });
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
  // started_at açıkça ISO yazılıyor (DB default'u Z'siz format üretir, bkz. toUtcIso).
  await db()
    .prepare("INSERT INTO cron_runs (id, started_at) VALUES (?1, ?2)")
    .bind(id, new Date().toISOString())
    .run();
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
      `UPDATE ideas SET scores = ?1, tags = ?2, last_reevaluated_at = ?3, last_reevaluation_summary = ?4,
         last_activity_at = ?3, last_activity_kind = 'reevaluated'
       WHERE id = ?5`,
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
      last_activity_at: now,
      last_activity_kind: "reevaluated",
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
  res.json({ competitors: results.map(serializeCompetitor) });
});

app.post("/admin/competitors", requireWorkflowSecret, async (req, res) => {
  const parsed = competitorsSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { idea_id, competitors } = parsed.data;
  const now = new Date().toISOString();
  const statements = [
    db().prepare("DELETE FROM idea_competitors WHERE idea_id = ?1").bind(idea_id),
    ...competitors.map((c) =>
      db()
        .prepare(
          `INSERT INTO idea_competitors (id, idea_id, app_name, url, similarity, note, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(crypto.randomUUID(), idea_id, c.app_name, c.url, c.similarity, c.note, now),
    ),
    // job_id'siz (örn. GitHub arayüzünden elle) çalıştırılsa da rozet güncellensin.
    stampActivity(idea_id, "competitors_found", now),
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
