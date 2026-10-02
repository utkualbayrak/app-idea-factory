import express from "express";
import cors from "cors";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { requireWorkflowSecret } from "./auth";
import { actorOf, resolveActor, SYSTEM_ACTOR } from "./identity";
import { fetchLastCommit, loadRepoState, parseRepoUrl, RepoSyncError, syncRepo } from "./repo-sync";
import { serializeDevReport, serializeTestRound, type DevReportRow, type TestRoundRow } from "./lifecycle";
import {
  toUtcIso,
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
  serializeProposal,
  type ProposalRow,
} from "./db";
import {
  ideaBatchRequestSchema,
  ideaPatchSchema,
  devReportSubmitSchema,
  manualIdeaSchema,
  evaluationSchema,
  testPlanSchema,
  testResultSubmitSchema,
  USER_STATUS_TRANSITIONS,
  type IdeaStatus,
  settingsPatchSchema,
  cronRunPatchSchema,
  cronRunCreateSchema,
  CRON_WORKFLOWS,
  CRON_RUN_STALE_MS,
  IDEA_JOB_STALE_MS,
  proposalsSubmitSchema,
  maintenanceFinalizeSchema,
  maintenanceScore,
  ARCHIVE_SCORE_THRESHOLD,
  ARCHIVE_AFTER_RUNS,
  MAINTENANCE_SETTING_DEFAULTS,
  POOL_STATUSES,
  DEV_FLOW_STATUSES,
  type MaintenanceSettingKey,
  type MergedIdea,
  triggerWorkflowSchema,
  userNameEmailSchema,
  userNamePutSchema,
  reevaluationSchema,
  competitorsSubmitSchema,
  trendSnapshotsSubmitSchema,
  workflowRunPatchSchema,
  workflowRunCreateSchema,
  taskCreateSchema,
  taskDocumentsSubmitSchema,
  taskDocumentPatchSchema,
  taskBuildReportSchema,
  DOCUMENT_KINDS,
  TASK_REPLANNABLE_STATUSES,
  TASK_BUILDABLE_STATUSES,
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
// "En son kim güncelledi": res.locals.actor (bkz. identity.ts).
app.use(resolveActor);

function db() {
  return (env as unknown as Env).DB;
}

function isIdeaWorkflow(workflow: string): workflow is IdeaWorkflow {
  return (IDEA_WORKFLOWS as readonly string[]).includes(workflow);
}

// Fikir listesindeki aktivite rozeti için (2. tur Grup C). by: isteği yapan
// kişi, workflow sonuçlarında SYSTEM_ACTOR.
function stampActivity(ideaId: string, kind: ActivityKind, at: string, by: string | null) {
  return db()
    .prepare("UPDATE ideas SET last_activity_at = ?1, last_activity_kind = ?2, last_activity_by = ?3 WHERE id = ?4")
    .bind(at, kind, by, ideaId);
}

// Aktivite rozetinin "görüldü"sü kişi başına (0015): isteği yapan kişinin
// idea_seen satırı varsa activity_seen_at onunla değiştirilir, yoksa
// ideas.activity_seen_at (eski, ortak değer) kalır. Workflow ve kimliği
// doğrulanamayan istekler ortak değeri görür.
function personalSeen(actor: string | null) {
  return actor && actor !== SYSTEM_ACTOR ? actor : null;
}

async function withSeen(rows: IdeaRow[], actor: string | null, ideaId?: string): Promise<IdeaRow[]> {
  const email = personalSeen(actor);
  if (!email || rows.length === 0) return rows;
  const { results } = ideaId
    ? await db()
        .prepare("SELECT idea_id, seen_at FROM idea_seen WHERE email = ?1 AND idea_id = ?2")
        .bind(email, ideaId)
        .all<{ idea_id: string; seen_at: string }>()
    : await db()
        .prepare("SELECT idea_id, seen_at FROM idea_seen WHERE email = ?1")
        .bind(email)
        .all<{ idea_id: string; seen_at: string }>();
  const seen = new Map(results.map((r) => [r.idea_id, r.seen_at]));
  return rows.map((row) => (seen.has(row.id) ? { ...row, activity_seen_at: seen.get(row.id)! } : row));
}

// Fikirdeki "en son kim güncelledi" — yalnızca kullanıcı değişikliklerinde.
function touchIdea(ideaId: string, at: string, by: string | null) {
  return db().prepare("UPDATE ideas SET updated_at = ?1, updated_by = ?2 WHERE id = ?3").bind(at, by, ideaId);
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

// Fikir bazlı bir işi (yeniden değerlendirme, rakip bulma, değerlendirme)
// başlatır: Çalışma geçmişinde görünsün diye önce workflow_runs'a 'queued'
// satırı yazılır; id'si workflow'a job_id input'u olarak geçer, workflow
// başlarken/biterken bu satırı günceller (scripts/start-workflow-run.ts,
// finish-workflow-run.ts). GitHub tetiklemesi başarısızsa satır ve fikir
// aktivitesi hemen 'failed' olur.
async function queueIdeaJob(token: string, workflow: IdeaWorkflow, ideaId: string, actor: string | null) {
  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  await db().batch([
    db()
      .prepare("INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)")
      .bind(jobId, workflow, ideaId, now),
    stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][0], now, actor),
  ]);

  const ghRes = await dispatchWorkflow(token, workflow, { idea_id: ideaId, job_id: jobId });
  if (!ghRes.ok) {
    await db().batch([
      db()
        .prepare("UPDATE workflow_runs SET status = 'failed', finished_at = ?1, error = ?2 WHERE id = ?3")
        .bind(now, `GitHub tetikleme başarısız (HTTP ${ghRes.status})`, jobId),
      stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][2], now, SYSTEM_ACTOR),
    ]);
  }
  return { ok: ghRes.ok, status: ghRes.status, jobId };
}

// scripts/validate-ideas.ts'deki ile aynı: "MealMate" / "Meal-Mates" aynı ad.
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, "");
}

// exceptIds: kendisi (yeniden adlandırma) ya da birleştirilen kaynaklar (birleşik
// fikir kaynaklardan birinin adını devralabilir). Kalıcı silinmiş fikirlerin
// adları retired_names'te (0016) kalır.
async function nameTaken(name: string, exceptIds: string | readonly string[] = []): Promise<boolean> {
  const target = normalizeName(name);
  if (!target) return false;
  const except = typeof exceptIds === "string" ? [exceptIds] : exceptIds;
  const [ideas, retired] = await db().batch<{ id?: string; name: string }>([
    db().prepare("SELECT id, name FROM ideas"),
    db().prepare("SELECT name FROM retired_names"),
  ]);
  return (
    ideas.results.some((row) => !except.includes(row.id!) && normalizeName(row.name) === target) ||
    retired.results.some((row) => row.name === target)
  );
}

app.get("/health", async (_req, res) => {
  const result = await db().prepare("SELECT 1 AS ok").first<{ ok: number }>();
  res.json({ status: "ok", db: result?.ok === 1 });
});

app.get("/ideas", async (req, res) => {
  // 'deleted' durumu listeden tamamen gizlenir (bkz. docs/PROJE.md "Kesinleşen
  // kararlar"); id üzerinden doğrudan erişim (GET /ideas/:id) hâlâ mümkün.
  // Havuz bakımı (0016): birleştirilmiş ve arşivlenmiş fikirler de gizli;
  // arşiv ?status=archived ile ayrıca listelenir.
  const batchDate = typeof req.query.batch_date === "string" ? req.query.batch_date : undefined;
  const hidden = "status NOT IN ('deleted', 'merged', 'archived')";

  const { results } =
    req.query.status === "archived"
      ? await db()
          .prepare("SELECT * FROM ideas WHERE status = 'archived' ORDER BY archived_at DESC")
          .all<IdeaRow>()
      : batchDate
        ? await db()
            .prepare(`SELECT * FROM ideas WHERE batch_date = ?1 AND ${hidden} ORDER BY created_at DESC`)
            .bind(batchDate)
            .all<IdeaRow>()
        : await db().prepare(`SELECT * FROM ideas WHERE ${hidden} ORDER BY created_at DESC`).all<IdeaRow>();

  res.json({ ideas: (await withSeen(results, actorOf(res))).map(serializeIdea) });
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

  const [idea] = await withSeen([row], actorOf(res), row.id);
  res.json({ idea: serializeIdea(idea) });
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

  const row = await db()
    .prepare("SELECT * FROM ideas WHERE id = ?1")
    .bind(req.params.id)
    .first<IdeaRow>();

  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const actor = actorOf(res);
  const seenBy = personalSeen(actor);
  // Ortak (eski) değer: kişi başına satır yazılınca dokunulmaz.
  const sharedSeenAt = row.activity_seen_at;
  const [existing] = await withSeen([row], actor, row.id);

  if (
    parsed.data.status &&
    parsed.data.status !== existing.status &&
    !USER_STATUS_TRANSITIONS[existing.status as IdeaStatus]?.includes(parsed.data.status)
  ) {
    res.status(409).json({ error: "invalid_status_transition", from: existing.status, to: parsed.data.status });
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

  // Gerçek bir değişiklik varsa (aktivite damgalandıysa) "en son kim
  // güncelledi" de damgalanır; yalnızca mark_seen bir okuma işaretidir.
  const lastActivityAt = activityKind ? now : existing.last_activity_at;
  const lastActivityKind = activityKind ?? existing.last_activity_kind;
  const lastActivityBy = activityKind ? actor : existing.last_activity_by;
  const updatedAt = activityKind ? now : existing.updated_at;
  const updatedBy = activityKind ? actor : existing.updated_by;
  const activitySeenAt = markSeen ? now : existing.activity_seen_at;
  // Kalıcı silme süresi silindiği andan başlar (bkz. havuz bakımı).
  const deletedAt = next.status === "deleted" && existing.status !== "deleted" ? now : existing.deleted_at;

  if (markSeen && seenBy) {
    await db()
      .prepare(
        `INSERT INTO idea_seen (idea_id, email, seen_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(idea_id, email) DO UPDATE SET seen_at = ?3`,
      )
      .bind(row.id, seenBy, now)
      .run();
  }

  await db()
    .prepare(
      `UPDATE ideas SET user_rating = ?1, user_note = ?2, user_note_updated_at = ?3, status = ?4,
         last_activity_at = ?5, last_activity_kind = ?6, last_activity_by = ?7, activity_seen_at = ?8,
         updated_at = ?9, updated_by = ?10, deleted_at = ?12
       WHERE id = ?11`,
    )
    .bind(
      next.user_rating ?? null,
      next.user_note ?? null,
      userNoteUpdatedAt,
      next.status,
      lastActivityAt,
      lastActivityKind,
      lastActivityBy,
      markSeen && !seenBy ? now : sharedSeenAt,
      updatedAt,
      updatedBy,
      req.params.id,
      deletedAt,
    )
    .run();

  res.json({
    idea: serializeIdea({
      ...next,
      user_note_updated_at: userNoteUpdatedAt,
      last_activity_at: lastActivityAt,
      last_activity_kind: lastActivityKind,
      last_activity_by: lastActivityBy,
      activity_seen_at: activitySeenAt,
      updated_at: updatedAt,
      updated_by: updatedBy,
      deleted_at: deletedAt,
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
  res.json({ settings, maintenance: await maintenanceSettings() });
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
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4`,
    )
    .bind(parsed.data.key, String(parsed.data.value), now, actorOf(res))
    .run();

  res.json({ ok: true });
});

// Ayarlar > Kullanıcılar: e-posta → görünen ad eşlemesi. Liste, eşlemesi
// olanlarla birlikte kayıtlarda geçen ama henüz adlandırılmamış e-postaları da
// içerir (display_name: null), böylece Ayarlar'da elle e-posta yazmak gerekmez.
app.get("/admin/user-names", async (_req, res) => {
  // D1 uzun UNION zincirlerini reddediyor (compound SELECT limiti); her
  // sütun ayrı sorgu, tek batch.
  const actorColumns = [
    ["ideas", "updated_by"],
    ["ideas", "last_activity_by"],
    ["tasks", "updated_by"],
    ["task_documents", "edited_by"],
    ["dev_reports", "updated_by"],
    ["test_rounds", "updated_by"],
    ["app_settings", "updated_by"],
    ["repo_syncs", "synced_by"],
    ["idea_seen", "email"],
  ] as const;
  const [mapped, ...seen] = await db().batch<{ email: string; display_name?: string; updated_at?: string }>([
    db().prepare("SELECT email, display_name, updated_at FROM user_names"),
    ...actorColumns.map(([table, column]) =>
      db().prepare(`SELECT DISTINCT ${column} AS email FROM ${table} WHERE ${column} IS NOT NULL`),
    ),
  ]);

  const users = new Map<string, { email: string; display_name: string | null; updated_at: string | null }>();
  for (const { email } of seen.flatMap((r) => r.results)) {
    if (email !== SYSTEM_ACTOR) users.set(email, { email, display_name: null, updated_at: null });
  }
  for (const row of mapped.results) {
    users.set(row.email, { email: row.email, display_name: row.display_name ?? null, updated_at: row.updated_at ?? null });
  }
  // Kendi e-postan, henüz hiçbir şey değiştirmemiş olsan da listede olsun.
  const me = actorOf(res);
  if (me && me !== SYSTEM_ACTOR && !users.has(me)) users.set(me, { email: me, display_name: null, updated_at: null });

  res.json({
    users: [...users.values()].sort((a, b) => a.email.localeCompare(b.email)),
    me,
  });
});

app.put("/admin/user-names/:email", async (req, res) => {
  const email = userNameEmailSchema.safeParse(req.params.email);
  const parsed = userNamePutSchema.safeParse(req.body);
  if (!email.success || !parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const now = new Date().toISOString();
  await db()
    .prepare(
      `INSERT INTO user_names (email, display_name, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(email) DO UPDATE SET display_name = ?2, updated_at = ?3`,
    )
    .bind(email.data, parsed.data.display_name, now)
    .run();
  res.json({ user: { email: email.data, display_name: parsed.data.display_name, updated_at: now } });
});

app.delete("/admin/user-names/:email", async (req, res) => {
  const email = userNameEmailSchema.safeParse(req.params.email);
  if (!email.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  await db().prepare("DELETE FROM user_names WHERE email = ?1").bind(email.data).run();
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

  if (isIdeaWorkflow(workflow)) {
    const ideaId = inputs.idea_id;
    const idea = ideaId
      ? await db().prepare("SELECT id FROM ideas WHERE id = ?1").bind(ideaId).first<{ id: string }>()
      : null;
    if (!ideaId || !idea) {
      res.status(400).json({ error: "idea_id_required" });
      return;
    }

    // Aynı iş bu fikir için zaten sıradaysa/çalışıyorsa ikinci kez tetiklenmez
    // (1 saatten eski kayıt takılmış sayılır, yeniden denemeye izin verilir).
    const active = await db()
      .prepare(
        "SELECT id FROM workflow_runs WHERE workflow = ?1 AND idea_id = ?2 AND status IN ('queued', 'running') AND created_at >= ?3",
      )
      .bind(workflow, ideaId, new Date(Date.now() - IDEA_JOB_STALE_MS).toISOString())
      .first();
    if (active) {
      res.status(409).json({ error: "already_running", message: "Bu iş bu fikir için zaten çalışıyor." });
      return;
    }

    const job = await queueIdeaJob(GH_WORKFLOW_DISPATCH_TOKEN, workflow, ideaId, actorOf(res));
    if (!job.ok) {
      res.status(502).json({ error: "github_dispatch_failed", status: job.status });
      return;
    }
    res.status(202).json({ ok: true, job_id: job.jobId });
    return;
  }

  // Günlük üretim / havuz bakımı: Çalışma geçmişi kaydı tetikleme anında
  // açılır ve id'si run_id input'uyla workflow'a geçer (start-cron-run.ts onu
  // kullanır), böylece ekran işi tetiklendiği andan itibaren "çalışıyor" görür.
  const cronKind = CRON_WORKFLOWS[workflow];
  if (cronKind) {
    const active = await db()
      .prepare("SELECT id FROM cron_runs WHERE kind = ?1 AND status = 'running' AND started_at >= ?2")
      .bind(cronKind, new Date(Date.now() - CRON_RUN_STALE_MS).toISOString())
      .first();
    if (active) {
      res.status(409).json({ error: "already_running", message: "Bu iş zaten çalışıyor." });
      return;
    }
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db()
      .prepare("INSERT INTO cron_runs (id, started_at, kind) VALUES (?1, ?2, ?3)")
      .bind(runId, now, cronKind)
      .run();
    const dispatched = await dispatchWorkflow(GH_WORKFLOW_DISPATCH_TOKEN, workflow, { ...inputs, run_id: runId });
    if (!dispatched.ok) {
      await db()
        .prepare("UPDATE cron_runs SET status = 'failed', finished_at = ?1, error = ?2 WHERE id = ?3")
        .bind(now, `GitHub tetikleme başarısız (HTTP ${dispatched.status})`, runId)
        .run();
      res.status(502).json({ error: "github_dispatch_failed", status: dispatched.status });
      return;
    }
    res.status(202).json({ ok: true, job_id: null, run_id: runId });
    return;
  }

  const ghRes = await dispatchWorkflow(GH_WORKFLOW_DISPATCH_TOKEN, workflow, inputs);
  if (!ghRes.ok) {
    res.status(502).json({ error: "github_dispatch_failed", status: ghRes.status });
    return;
  }
  res.status(202).json({ ok: true, job_id: null });
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
    stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][0], now, SYSTEM_ACTOR),
  ];
  statements.push(...taskRunHooks(workflow, ideaId, "running", null, now));
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
    statements.push(...taskRunHooks(run.workflow, run.idea_id, "running", null, now));
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
      statements.push(stampActivity(run.idea_id, status === "success" ? okKind : failKind, now, SYSTEM_ACTOR));
    }
    statements.push(...taskRunHooks(run.workflow, run.idea_id, status, error ?? null, now));
    await db().batch(statements);
  }

  res.json({ ok: true });
});

// Faz 3A: "Geliştir" akışı. Görev formu kaydedilir, fikir
// 'awaiting_development' olur ve Claude'un planlama belgelerini yazdığı
// plan-idea.yml tetiklenir. Fikir başına tek görev: belgeleri yeniden üretmek
// (planning_failed / ready durumunda) aynı satırı günceller.

// Görev workflow'larının (plan-idea.yml, build-skeleton.yml) çalışma durumu
// göreve yansır. Başarı yolları ayrı uçlarda işlenir (belgeler gelince 'ready',
// iskelet bitince 'done'); burada başlangıç ve başarısızlık var. Elle
// (job_id'siz) başlatılan çalışmalar da görevi doğru duruma çeker.
function taskRunHooks(
  workflow: string,
  ideaId: string,
  status: "running" | "success" | "failed",
  error: string | null,
  now: string,
) {
  if (workflow === "plan-idea.yml") {
    if (status === "running") {
      // Kilitli (iskelet aşamasındaki) görevlere dokunmaz.
      return [
        db()
          .prepare(
            "UPDATE tasks SET status = 'planning', error = NULL, updated_at = ?1, updated_by = 'system' WHERE idea_id = ?2 AND status IN ('planning', 'planning_failed', 'ready')",
          )
          .bind(now, ideaId),
      ];
    }
    if (status === "failed") {
      return [
        db()
          .prepare(
            "UPDATE tasks SET status = 'planning_failed', error = ?1, updated_at = ?2, updated_by = 'system' WHERE idea_id = ?3 AND status = 'planning'",
          )
          .bind(error ?? "Belge üretimi başarısız oldu.", now, ideaId),
      ];
    }
  }
  if (workflow === "build-skeleton.yml") {
    if (status === "running") {
      return [
        db()
          .prepare(
            "UPDATE tasks SET status = 'running', error = NULL, updated_at = ?1, updated_by = 'system' WHERE idea_id = ?2 AND status IN ('ready', 'queued', 'failed')",
          )
          .bind(now, ideaId),
        db()
          .prepare("UPDATE ideas SET status = 'in_development' WHERE id = ?1 AND status = 'awaiting_development'")
          .bind(ideaId),
      ];
    }
    if (status === "failed") {
      return [
        db()
          .prepare(
            "UPDATE tasks SET status = 'failed', error = ?1, updated_at = ?2, updated_by = 'system' WHERE idea_id = ?3 AND status IN ('queued', 'running')",
          )
          .bind(error ?? "İskelet üretimi başarısız oldu.", now, ideaId),
      ];
    }
  }
  return [];
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
  // Elle girilmiş, henüz puanlanmamış (ve belki doldurulmamış) fikir planlanamaz.
  if (JSON.parse(idea.scores) == null) {
    res.status(409).json({ error: "not_evaluated", message: "Fikir henüz Claude ile değerlendirilmedi." });
    return;
  }

  const now = new Date().toISOString();
  const actor = actorOf(res);
  const taskId = existing?.id ?? crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const workflow = "plan-idea.yml";

  await db().batch([
    existing
      ? db()
          .prepare(
            "UPDATE tasks SET params = ?1, status = 'planning', error = NULL, updated_at = ?2, updated_by = ?3 WHERE id = ?4",
          )
          .bind(JSON.stringify(params), now, actor, taskId)
      : db()
          .prepare(
            "INSERT INTO tasks (id, idea_id, created_at, updated_at, updated_by, params, status) VALUES (?1, ?2, ?3, ?3, ?4, ?5, 'planning')",
          )
          .bind(taskId, ideaId, now, actor, JSON.stringify(params)),
    db()
      .prepare("UPDATE ideas SET status = 'awaiting_development' WHERE id = ?1")
      .bind(ideaId),
    touchIdea(ideaId, now, actor),
    db()
      .prepare("INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)")
      .bind(jobId, workflow, ideaId, now),
    stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][0], now, actor),
  ]);

  const ghRes = await dispatchWorkflow(GH_WORKFLOW_DISPATCH_TOKEN, workflow, { idea_id: ideaId, job_id: jobId });
  if (!ghRes.ok) {
    const error = `GitHub tetikleme başarısız (HTTP ${ghRes.status})`;
    await db().batch([
      db()
        .prepare("UPDATE workflow_runs SET status = 'failed', finished_at = ?1, error = ?2 WHERE id = ?3")
        .bind(now, error, jobId),
      db()
        .prepare("UPDATE tasks SET status = 'planning_failed', error = ?1, updated_at = ?2, updated_by = 'system' WHERE id = ?3")
        .bind(error, now, taskId),
      stampActivity(ideaId, WORKFLOW_ACTIVITY[workflow][2], now, SYSTEM_ACTOR),
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
    res.json({ task: null, documents: [], repo: null });
    return;
  }

  const [{ results }, repo] = await Promise.all([
    db().prepare("SELECT * FROM task_documents WHERE task_id = ?1").bind(task.id).all<TaskDocumentRow>(),
    loadRepoState(db(), task.id),
  ]);
  const order = (kind: string) => DOCUMENT_KINDS.indexOf(kind as (typeof DOCUMENT_KINDS)[number]);
  const documents = results.sort((a, b) => order(a.kind) - order(b.kind)).map(serializeTaskDocument);

  res.json({ task: serializeTask(task), documents, repo });
});

// Faz 3 sonrası tur, Grup 5: elle fikir girişi. Formla girilen fikir
// puansız kaydedilir; açıklamayla girilen fikir için evaluate-idea.yml hemen
// tetiklenir (alanları doldurup puanlar). İsim çakışması günlük üretimdeki
// gibi normalize edilerek tüm fikirlere (silinmişler dahil) karşı kontrol edilir.
app.post("/ideas/manual", async (req, res) => {
  const parsed = manualIdeaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const input = parsed.data;
  if (input.name && (await nameTaken(input.name))) {
    res.status(409).json({ error: "name_taken", message: `"${input.name}" adı (ya da çok benzeri) zaten kullanılıyor.` });
    return;
  }

  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (input.mode === "describe" && !GH_WORKFLOW_DISPATCH_TOKEN) {
    res.status(500).json({ error: "not_configured", message: "GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı yok." });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const batchDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  // "describe" yolunda alanlar Claude doldurana kadar boş; tek cümle yerine
  // açıklamanın başı gösterilir.
  const row =
    input.mode === "form"
      ? {
          name: input.name,
          one_liner: input.one_liner,
          problem: input.problem,
          target_audience: input.target_audience,
          core_features: input.core_features,
          monetization: input.monetization,
          category: input.category.toLowerCase(),
          tags: input.tags.map((t) => t.toLowerCase()),
          source_text: null,
        }
      : {
          name: input.name || "Adsız fikir",
          one_liner: input.description.length > 160 ? `${input.description.slice(0, 157)}…` : input.description,
          problem: "",
          target_audience: "",
          core_features: [],
          monetization: "",
          category: "",
          tags: [],
          source_text: input.description,
        };

  await db()
    .prepare(
      `INSERT INTO ideas (id, created_at, batch_date, name, one_liner, problem, target_audience, core_features,
         monetization, category, inspiration_sources, tags, scores, status, origin, source_text, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '[]', ?11, 'null', 'new', 'manual', ?12, ?2, ?13)`,
    )
    .bind(
      id,
      now,
      batchDate,
      row.name,
      row.one_liner,
      row.problem,
      row.target_audience,
      JSON.stringify(row.core_features),
      row.monetization,
      row.category,
      JSON.stringify(row.tags),
      row.source_text,
      actorOf(res),
    )
    .run();

  let dispatchError: string | null = null;
  if (input.mode === "describe" && GH_WORKFLOW_DISPATCH_TOKEN) {
    const job = await queueIdeaJob(GH_WORKFLOW_DISPATCH_TOKEN, "evaluate-idea.yml", id, actorOf(res));
    if (!job.ok) dispatchError = `Claude işi tetiklenemedi (GitHub HTTP ${job.status}); detay sayfasından tekrar deneyebilirsin.`;
  }

  const created = await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(id).first<IdeaRow>();
  res.status(201).json({ idea: created ? serializeIdea(created) : null, dispatch_error: dispatchError });
});

// evaluate-idea.yml sonucu (workflow-only). Fikir "describe" yoluyla girilmiş
// ve henüz doldurulmamışsa (source_text var, scores null) fields ile tüm
// alanlar yazılır; aksi halde yalnızca puan, etiket ve (boşsa) kategori.
app.patch("/admin/ideas/:id/evaluation", requireWorkflowSecret, async (req, res) => {
  const parsed = evaluationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const idea = await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(req.params.id).first<IdeaRow>();
  if (!idea) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const { scores, tags, category, fields } = parsed.data;
  const completing = idea.source_text != null && JSON.parse(idea.scores) == null;
  if (completing && !fields) {
    res.status(400).json({ error: "fields_required", message: "Açıklamadan girilen fikir için alanlar zorunlu." });
    return;
  }
  if (completing && fields && (await nameTaken(fields.name, idea.id))) {
    res.status(409).json({ error: "name_taken", message: `"${fields.name}" adı zaten kullanılıyor.` });
    return;
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db()
      .prepare("UPDATE ideas SET scores = ?1, tags = ?2, category = ?3, last_reevaluated_at = ?4 WHERE id = ?5")
      .bind(
        JSON.stringify(scores),
        JSON.stringify(completing || JSON.parse(idea.tags).length === 0 ? tags : JSON.parse(idea.tags)),
        completing || !idea.category ? category : idea.category,
        now,
        idea.id,
      ),
    stampActivity(idea.id, "evaluated", now, SYSTEM_ACTOR),
  ];
  if (completing && fields) {
    statements.push(
      db()
        .prepare(
          `UPDATE ideas SET name = ?1, one_liner = ?2, problem = ?3, target_audience = ?4, core_features = ?5,
             monetization = ?6 WHERE id = ?7`,
        )
        .bind(
          fields.name,
          fields.one_liner,
          fields.problem,
          fields.target_audience,
          JSON.stringify(fields.core_features),
          fields.monetization,
          idea.id,
        ),
    );
  }
  await db().batch(statements);
  res.json({ ok: true, completed: completing });
});

// Faz 3 sonrası tur, Grup 3: geliştirme raporları ve "Geliştirildi" formu.
app.get("/ideas/:id/dev-reports", async (req, res) => {
  const { results } = await db()
    .prepare("SELECT * FROM dev_reports WHERE idea_id = ?1 ORDER BY round DESC")
    .bind(req.params.id)
    .all<DevReportRow>();
  res.json({ reports: results.map(serializeDevReport) });
});

// Formu kaydeder ve fikri 'awaiting_test' yapar. Tur numarası:
// - rework'ten (testten dönmüş) gönderim → yeni tur (son rapor ve son test
//   turunun büyüğü + 1).
// - in_development'tan gönderim → hiç rapor yoksa 1. tur; varsa ("Test
//   bekliyor"dan geri alınmış) son raporun üzerine yazılır.
app.post("/ideas/:id/dev-report", async (req, res) => {
  const parsed = devReportSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const idea = await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(req.params.id).first<IdeaRow>();
  if (!idea) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (idea.status !== "in_development" && idea.status !== "rework") {
    res.status(409).json({ error: "invalid_status", message: "Fikir geliştirme aşamasında değil." });
    return;
  }
  const task = await db().prepare("SELECT status FROM tasks WHERE idea_id = ?1").bind(idea.id).first<{ status: string }>();
  if (task?.status !== "done") {
    res.status(409).json({ error: "skeleton_not_ready", message: "İskelet henüz hazır değil." });
    return;
  }

  const latest = await db()
    .prepare("SELECT * FROM dev_reports WHERE idea_id = ?1 ORDER BY round DESC LIMIT 1")
    .bind(idea.id)
    .first<DevReportRow>();
  const replaceLatest = idea.status === "in_development" && latest != null;
  // Yeni tur, test edilmiş son turdan sonra gelir (raporu olmadan teste giden
  // eski kayıtlarda test turu rapordan ileride olabilir).
  const lastTest = await db()
    .prepare("SELECT MAX(round) AS round FROM test_rounds WHERE idea_id = ?1 AND status != 'cancelled'")
    .bind(idea.id)
    .first<{ round: number | null }>();
  const round = replaceLatest ? latest.round : Math.max(latest?.round ?? 0, lastTest?.round ?? 0) + 1;

  const now = new Date().toISOString();
  const actor = actorOf(res);
  const body = parsed.data;
  const values = [
    body.roadmap_source,
    JSON.stringify(body.roadmap_items),
    JSON.stringify(body.missing_features),
    JSON.stringify(body.extra_features),
    JSON.stringify(body.notes),
  ];

  const reportId = replaceLatest ? latest.id : crypto.randomUUID();
  const write = replaceLatest
    ? db()
        .prepare(
          `UPDATE dev_reports SET roadmap_source = ?1, roadmap_items = ?2, missing_features = ?3, extra_features = ?4,
             notes = ?5, updated_at = ?6, updated_by = ?7 WHERE id = ?8`,
        )
        .bind(...values, now, actor, reportId)
    : db()
        .prepare(
          `INSERT INTO dev_reports (id, idea_id, round, created_at, updated_at, roadmap_source, roadmap_items,
             missing_features, extra_features, notes, updated_by)
           VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        )
        .bind(reportId, idea.id, round, now, ...values, actor);

  await db().batch([
    write,
    db().prepare("UPDATE ideas SET status = 'awaiting_test' WHERE id = ?1").bind(idea.id),
    touchIdea(idea.id, now, actor),
    stampActivity(idea.id, "status_changed", now, actor),
  ]);

  const report = await db().prepare("SELECT * FROM dev_reports WHERE id = ?1").bind(reportId).first<DevReportRow>();
  res.json({ report: report ? serializeDevReport(report) : null });
});

// Faz 3 sonrası tur, Grup 4: test turları.
app.get("/ideas/:id/test-rounds", async (req, res) => {
  const { results } = await db()
    .prepare("SELECT * FROM test_rounds WHERE idea_id = ?1 ORDER BY created_at DESC")
    .bind(req.params.id)
    .all<TestRoundRow>();
  res.json({ rounds: results.map(serializeTestRound) });
});

// "Testi başlat": test planıyla yeni tur açar, fikir 'testing' olur. Tur
// numarası test edilen geliştirme raporunun turu (rapor yoksa 1).
app.post("/ideas/:id/test-rounds", async (req, res) => {
  const parsed = testPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const idea = await db().prepare("SELECT status FROM ideas WHERE id = ?1").bind(req.params.id).first<{ status: string }>();
  if (!idea) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (idea.status !== "awaiting_test") {
    res.status(409).json({ error: "invalid_status", message: "Fikir test bekliyor durumunda değil." });
    return;
  }

  const report = await db()
    .prepare("SELECT MAX(round) AS round FROM dev_reports WHERE idea_id = ?1")
    .bind(req.params.id)
    .first<{ round: number | null }>();
  const now = new Date().toISOString();
  const actor = actorOf(res);
  const roundId = crypto.randomUUID();

  await db().batch([
    db()
      .prepare(
        `INSERT INTO test_rounds (id, idea_id, round, status, created_at, updated_at, plan, updated_by)
         VALUES (?1, ?2, ?3, 'running', ?4, ?4, ?5, ?6)`,
      )
      .bind(roundId, req.params.id, report?.round ?? 1, now, JSON.stringify(parsed.data), actor),
    db().prepare("UPDATE ideas SET status = 'testing' WHERE id = ?1").bind(req.params.id),
    touchIdea(req.params.id, now, actor),
    stampActivity(req.params.id, "status_changed", now, actor),
  ]);

  const row = await db().prepare("SELECT * FROM test_rounds WHERE id = ?1").bind(roundId).first<TestRoundRow>();
  res.json({ round: row ? serializeTestRound(row) : null });
});

async function loadRunningRound(id: string) {
  return db().prepare("SELECT * FROM test_rounds WHERE id = ?1 AND status = 'running'").bind(id).first<TestRoundRow>();
}

// Sonuç formu: turu kapatır. Onay → fikir 'approved' (Dağıtıma hazır),
// geri gönderme → 'rework' (sebep zorunlu, Geliştirilenler'e döner).
app.post("/test-rounds/:id/result", async (req, res) => {
  const parsed = testResultSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const round = await loadRunningRound(req.params.id);
  if (!round) {
    res.status(409).json({ error: "round_not_running", message: "Bu test turu açık değil." });
    return;
  }

  const { result, decision, rework_reason: reworkReason } = parsed.data;
  const now = new Date().toISOString();
  const actor = actorOf(res);
  await db().batch([
    db()
      .prepare(
        `UPDATE test_rounds SET status = ?1, result = ?2, rework_reason = ?3, finished_at = ?4, updated_at = ?4,
           updated_by = ?5
         WHERE id = ?6`,
      )
      .bind(
        decision,
        JSON.stringify(result),
        decision === "rework" && reworkReason ? JSON.stringify(reworkReason) : null,
        now,
        actor,
        round.id,
      ),
    db().prepare("UPDATE ideas SET status = ?1 WHERE id = ?2").bind(decision, round.idea_id),
    touchIdea(round.idea_id, now, actor),
    stampActivity(round.idea_id, "status_changed", now, actor),
  ]);

  const row = await db().prepare("SELECT * FROM test_rounds WHERE id = ?1").bind(round.id).first<TestRoundRow>();
  res.json({ round: row ? serializeTestRound(row) : null });
});

// Yarıda kalan turu iptal eder; fikir tekrar "Test bekliyor".
app.post("/test-rounds/:id/cancel", async (req, res) => {
  const round = await loadRunningRound(req.params.id);
  if (!round) {
    res.status(409).json({ error: "round_not_running", message: "Bu test turu açık değil." });
    return;
  }
  const now = new Date().toISOString();
  const actor = actorOf(res);
  await db().batch([
    db()
      .prepare(
        "UPDATE test_rounds SET status = 'cancelled', finished_at = ?1, updated_at = ?1, updated_by = ?2 WHERE id = ?3",
      )
      .bind(now, actor, round.id),
    db().prepare("UPDATE ideas SET status = 'awaiting_test' WHERE id = ?1").bind(round.idea_id),
    touchIdea(round.idea_id, now, actor),
    stampActivity(round.idea_id, "status_changed", now, actor),
  ]);
  res.json({ ok: true });
});

// Geliştirme aşamasındaki fikrin rozetindeki "son commit" tarihi. Görev ya da
// repo yoksa commit null döner.
app.get("/ideas/:id/last-commit", async (req, res) => {
  const task = await db()
    .prepare("SELECT repo_url FROM tasks WHERE idea_id = ?1")
    .bind(req.params.id)
    .first<{ repo_url: string | null }>();
  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (!task?.repo_url || !GH_WORKFLOW_DISPATCH_TOKEN) {
    res.json({ commit: null });
    return;
  }
  try {
    res.json({ commit: await fetchLastCommit(GH_WORKFLOW_DISPATCH_TOKEN, task.repo_url) });
  } catch (err) {
    if (err instanceof RepoSyncError) {
      res.status(502).json({ error: "github_failed", message: err.message });
      return;
    }
    throw err;
  }
});

// Faz 3 sonrası tur, Grup 2: iskelet reposundan son commit'leri ve md
// dosyalarını çeker (bkz. repo-sync.ts). Workflow yok, Claude yok — Worker
// doğrudan GitHub API'ye gider, aynı PAT (repo scope'u private repoyu okur).
app.post("/tasks/:id/sync", async (req, res) => {
  const task = await db().prepare("SELECT * FROM tasks WHERE id = ?1").bind(req.params.id).first<TaskRow>();
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!task.repo_url) {
    res.status(409).json({ error: "no_repo", message: "Bu görevin henüz bir reposu yok." });
    return;
  }

  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (!GH_WORKFLOW_DISPATCH_TOKEN) {
    res.status(500).json({ error: "missing_token", message: "GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı yok." });
    return;
  }

  try {
    await syncRepo(db(), GH_WORKFLOW_DISPATCH_TOKEN, task.id, task.repo_url, actorOf(res));
  } catch (err) {
    if (err instanceof RepoSyncError) {
      res.status(502).json({ error: "sync_failed", message: err.message });
      return;
    }
    throw err;
  }

  res.json({ repo: await loadRepoState(db(), task.id) });
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
      .prepare("UPDATE tasks SET status = 'ready', error = NULL, updated_at = ?1, updated_by = 'system' WHERE id = ?2")
      .bind(now, task.id),
    // job_id'siz (elle) çalıştırılsa da rozet güncellensin.
    stampActivity(ideaId, "planned", now, SYSTEM_ACTOR),
  ]);

  res.status(201).json({ ok: true });
});

// Faz 3B: kullanıcı belgeleri arayüzde düzenler — yalnızca görev 'ready'
// iken (iskelete geçildikten sonra belgeler kilitli).
app.patch("/tasks/:id/documents/:kind", async (req, res) => {
  const parsed = taskDocumentPatchSchema.safeParse(req.body);
  const kind = DOCUMENT_KINDS.find((k) => k === req.params.kind);
  if (!parsed.success || !kind) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const task = await db().prepare("SELECT * FROM tasks WHERE id = ?1").bind(req.params.id).first<TaskRow>();
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (task.status !== "ready") {
    res.status(409).json({ error: "task_locked", status: task.status });
    return;
  }

  const now = new Date().toISOString();
  const result = await db()
    .prepare(
      "UPDATE task_documents SET content = ?1, user_edited_at = ?2, edited_by = ?3 WHERE task_id = ?4 AND kind = ?5",
    )
    .bind(parsed.data.content, now, actorOf(res), task.id, kind)
    .run();
  if (result.meta.changes === 0) {
    res.status(404).json({ error: "document_not_found" });
    return;
  }

  const doc = await db()
    .prepare("SELECT * FROM task_documents WHERE task_id = ?1 AND kind = ?2")
    .bind(task.id, kind)
    .first<TaskDocumentRow>();
  res.json({ document: doc ? serializeTaskDocument(doc) : null });
});

// Faz 3B/3C: "Geliştirmeye başla" (ready) ve "Tekrar dene" (failed) —
// görev 'queued', fikir 'in_development' olur ve build-skeleton.yml tetiklenir.
// Tekrar deneme aynı repo/issue'yu ve aynı (kilitli) belgeleri kullanır.
app.post("/tasks/:id/build", async (req, res) => {
  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (!GH_WORKFLOW_DISPATCH_TOKEN) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const task = await db().prepare("SELECT * FROM tasks WHERE id = ?1").bind(req.params.id).first<TaskRow>();
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!TASK_BUILDABLE_STATUSES.includes(task.status)) {
    res.status(409).json({ error: "invalid_task_status", status: task.status });
    return;
  }
  const docCount = await db()
    .prepare("SELECT count(*) AS n FROM task_documents WHERE task_id = ?1")
    .bind(task.id)
    .first<{ n: number }>();
  if ((docCount?.n ?? 0) < DOCUMENT_KINDS.length) {
    res.status(409).json({ error: "documents_missing" });
    return;
  }
  const idea = await db().prepare("SELECT status FROM ideas WHERE id = ?1").bind(task.idea_id).first<{ status: string }>();

  const now = new Date().toISOString();
  const actor = actorOf(res);
  const jobId = crypto.randomUUID();
  const workflow = "build-skeleton.yml";

  await db().batch([
    db()
      .prepare("UPDATE tasks SET status = 'queued', error = NULL, updated_at = ?1, updated_by = ?2 WHERE id = ?3")
      .bind(now, actor, task.id),
    db().prepare("UPDATE ideas SET status = 'in_development' WHERE id = ?1").bind(task.idea_id),
    touchIdea(task.idea_id, now, actor),
    db()
      .prepare("INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)")
      .bind(jobId, workflow, task.idea_id, now),
    stampActivity(task.idea_id, WORKFLOW_ACTIVITY[workflow][0], now, actor),
  ]);

  const ghRes = await dispatchWorkflow(GH_WORKFLOW_DISPATCH_TOKEN, workflow, { idea_id: task.idea_id, job_id: jobId });
  if (!ghRes.ok) {
    // Hiçbir şey başlamadı: görev ve fikir önceki durumlarına döner, hata görünür kalır.
    const error = `GitHub tetikleme başarısız (HTTP ${ghRes.status})`;
    await db().batch([
      db()
        .prepare("UPDATE workflow_runs SET status = 'failed', finished_at = ?1, error = ?2 WHERE id = ?3")
        .bind(now, error, jobId),
      db()
        .prepare("UPDATE tasks SET status = ?1, error = ?2, updated_at = ?3, updated_by = 'system' WHERE id = ?4")
        .bind(task.status, error, now, task.id),
      db()
        .prepare("UPDATE ideas SET status = ?1 WHERE id = ?2")
        .bind(idea?.status ?? "awaiting_development", task.idea_id),
      stampActivity(task.idea_id, WORKFLOW_ACTIVITY[workflow][2], now, SYSTEM_ACTOR),
    ]);
    res.status(502).json({ error: "github_dispatch_failed", status: ghRes.status });
    return;
  }

  const updated = await db().prepare("SELECT * FROM tasks WHERE id = ?1").bind(task.id).first<TaskRow>();
  res.status(202).json({ task: updated ? serializeTask(updated) : null });
});

// Faz 3C: build-skeleton.yml'ın repo/issue adresleri ve başarı bildirimi.
app.patch("/admin/tasks/build", requireWorkflowSecret, async (req, res) => {
  const parsed = taskBuildReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  const { idea_id: ideaId, repo_url: repoUrl, issue_url: issueUrl, status } = parsed.data;
  const task = await db().prepare("SELECT * FROM tasks WHERE idea_id = ?1").bind(ideaId).first<TaskRow>();
  if (!task) {
    res.status(404).json({ error: "task_not_found" });
    return;
  }

  const now = new Date().toISOString();
  const statements = [
    db()
      .prepare(
        `UPDATE tasks SET repo_url = COALESCE(?1, repo_url), issue_url = COALESCE(?2, issue_url),
           status = COALESCE(?3, status), error = CASE WHEN ?3 IS NULL THEN error ELSE NULL END, updated_at = ?4,
           updated_by = 'system'
         WHERE id = ?5`,
      )
      .bind(repoUrl ?? null, issueUrl ?? null, status ?? null, now, task.id),
  ];
  // job_id'siz (elle) çalıştırılsa da rozet güncellensin.
  if (status === "done") statements.push(stampActivity(ideaId, "skeleton_built", now, SYSTEM_ACTOR));
  await db().batch(statements);

  res.json({ ok: true });
});

// Grup 3: cron geçmişi ekranı.
app.get("/admin/cron-runs", async (req, res) => {
  const limit = Number(req.query.limit ?? 30);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 30;

  // Varsayılan: günlük üretim koşuları (mevcut ekranlar); havuz bakımı ?kind=merge.
  const kind = req.query.kind === "merge" ? "merge" : "daily";
  const { results } = await db()
    .prepare("SELECT * FROM cron_runs WHERE kind = ?2 ORDER BY started_at DESC LIMIT ?1")
    .bind(safeLimit, kind)
    .all<CronRunRow>();

  res.json({ runs: results.map(serializeCronRun) });
});

app.post("/admin/cron-runs", requireWorkflowSecret, async (req, res) => {
  const parsed = cronRunCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const id = crypto.randomUUID();
  // started_at açıkça ISO yazılıyor (DB default'u Z'siz format üretir, bkz. toUtcIso).
  await db()
    .prepare("INSERT INTO cron_runs (id, started_at, kind, run_url) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, new Date().toISOString(), parsed.data.kind ?? "daily", parsed.data.run_url ?? null)
    .run();
  res.status(201).json({ id });
});

app.patch("/admin/cron-runs/:id", requireWorkflowSecret, async (req, res) => {
  const parsed = cronRunPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }

  // İş başladı: kayıt tetiklenirken açılmıştı, yalnızca log adresi yazılır.
  if (parsed.data.status === "running") {
    await db()
      .prepare("UPDATE cron_runs SET run_url = COALESCE(?1, run_url) WHERE id = ?2")
      .bind(parsed.data.run_url ?? null, req.params.id)
      .run();
    res.json({ ok: true });
    return;
  }

  const now = new Date().toISOString();
  await db()
    .prepare(
      `UPDATE cron_runs SET status = ?1, finished_at = ?2, source_breakdown = ?3, error = ?4,
         summary = COALESCE(?6, summary), run_url = COALESCE(?7, run_url) WHERE id = ?5`,
    )
    .bind(
      parsed.data.status,
      now,
      parsed.data.source_breakdown ? JSON.stringify(parsed.data.source_breakdown) : null,
      parsed.data.error ?? null,
      req.params.id,
      parsed.data.summary ? JSON.stringify(parsed.data.summary) : null,
      parsed.data.run_url ?? null,
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
         last_activity_at = ?3, last_activity_kind = 'reevaluated', last_activity_by = 'system'
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
      last_activity_by: SYSTEM_ACTOR,
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
    stampActivity(idea_id, "competitors_found", now, SYSTEM_ACTOR),
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

// ---------------------------------------------------------------------------
// Havuz bakımı (0016, merge-ideas.yml): Fikirler listesindeki yakın fikirleri
// birleştirme ve geliştirmedeki fikirlere özellik önerme. Claude önerir; el
// değmemiş fikirlerin birleştirmesi hemen uygulanır (geri alınabilir), diğer
// her şey Öneriler ekranında onay bekler.

class ProposalError extends Error {}

async function maintenanceSettings(): Promise<Record<MaintenanceSettingKey, number>> {
  const keys = Object.keys(MAINTENANCE_SETTING_DEFAULTS) as MaintenanceSettingKey[];
  const { results } = await db()
    .prepare(`SELECT key, value FROM app_settings WHERE key IN (${keys.map((_, i) => `?${i + 1}`).join(", ")})`)
    .bind(...keys)
    .all<{ key: MaintenanceSettingKey; value: string }>();
  const settings: Record<MaintenanceSettingKey, number> = { ...MAINTENANCE_SETTING_DEFAULTS };
  for (const row of results) {
    const value = Number(row.value);
    if (Number.isFinite(value)) settings[row.key] = value;
  }
  return settings;
}

function todayInIstanbul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function placeholders(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => `?${i + 1 + offset}`).join(", ");
}

async function ideasByIds(ids: readonly string[]): Promise<IdeaRow[]> {
  if (ids.length === 0) return [];
  const { results } = await db()
    .prepare(`SELECT * FROM ideas WHERE id IN (${placeholders(ids.length)})`)
    .bind(...ids)
    .all<IdeaRow>();
  return results;
}

function isPoolStatus(status: string) {
  return (POOL_STATUSES as readonly string[]).includes(status);
}

function isDevFlowStatus(status: string) {
  return (DEV_FLOW_STATUSES as readonly string[]).includes(status);
}

// Kullanıcı bu fikre hiç dokunmadı mı: puan yok, not yok, askıya alınmamış.
// Böyle fikirlerin birleştirmesi onay beklemeden uygulanır.
function untouched(row: IdeaRow) {
  return row.status === "new" && row.user_rating == null && !row.user_note?.trim();
}

// Bekleyen bir önerideki fikirler yeni önerilere girmez.
async function pendingProposalIdeaIds(): Promise<Set<string>> {
  const { results } = await db()
    .prepare("SELECT source_ids FROM pool_proposals WHERE status = 'pending'")
    .all<{ source_ids: string }>();
  return new Set(results.flatMap((r) => JSON.parse(r.source_ids) as string[]));
}

// Ekranlar için kısa fikir özeti (öneri kartları, "Birleştirilen fikirler").
function ideaSummary(row: IdeaRow) {
  const scores = JSON.parse(row.scores) as { overall?: number } | null;
  return {
    id: row.id,
    name: row.name,
    one_liner: row.one_liner,
    category: row.category,
    status: row.status,
    user_rating: row.user_rating,
    user_note: row.user_note,
    overall: scores?.overall ?? null,
    merged_into_id: row.merged_into_id,
  };
}

async function proposalsResponse(rows: ProposalRow[]) {
  const proposals = rows.map(serializeProposal);
  const ids = new Set<string>();
  for (const p of proposals) {
    p.source_ids.forEach((id) => ids.add(id));
    if (p.target_idea_id) ids.add(p.target_idea_id);
  }
  const ideas = await ideasByIds([...ids]);
  return { proposals, ideas: Object.fromEntries(ideas.map((row) => [row.id, ideaSummary(row)])) };
}

// Birleştirmeyi uygular: yeni fikir eklenir, kaynaklar 'merged' olur ve yeni
// fikre bağlanır. Kaynaklardan biri artık havuzda değilse ya da ad çakışırsa
// ProposalError (öneri bekler, kullanıcı karar verir).
async function applyMerge(proposal: ProposalRow, actor: string | null, auto: boolean) {
  const sourceIds = JSON.parse(proposal.source_ids) as string[];
  const idea = JSON.parse(proposal.payload) as MergedIdea;
  const sources = await ideasByIds(sourceIds);
  if (sources.length !== sourceIds.length || sources.some((row) => !isPoolStatus(row.status))) {
    throw new ProposalError("Kaynak fikirlerden biri artık Fikirler listesinde değil.");
  }
  if (await nameTaken(idea.name, sourceIds)) {
    throw new ProposalError(`"${idea.name}" adı başka bir fikirle çakışıyor.`);
  }

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userBy = auto ? null : actor;
  const statements: D1PreparedStatement[] = [
    db()
      .prepare(
        `INSERT INTO ideas (id, created_at, batch_date, name, one_liner, problem, target_audience, core_features,
           monetization, category, inspiration_sources, tags, scores, status, origin, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'new', 'merge', ?14, ?15)`,
      )
      .bind(
        newId,
        now,
        todayInIstanbul(),
        idea.name,
        idea.one_liner,
        idea.problem,
        idea.target_audience,
        JSON.stringify(idea.core_features),
        idea.monetization,
        idea.category.toLowerCase(),
        JSON.stringify(idea.inspiration_sources),
        JSON.stringify(idea.tags.map((t) => t.toLowerCase())),
        JSON.stringify(idea.scores),
        userBy ? now : null,
        userBy,
      ),
    db()
      .prepare(
        `UPDATE ideas SET status = 'merged', merged_into_id = ?1 WHERE id IN (${placeholders(sourceIds.length, 1)})`,
      )
      .bind(newId, ...sourceIds),
    db()
      .prepare(
        `UPDATE pool_proposals SET status = 'applied', auto_applied = ?1, target_idea_id = ?2, source_prev_statuses = ?3,
           decided_at = ?4, decided_by = ?5, error = NULL WHERE id = ?6`,
      )
      .bind(
        auto ? 1 : 0,
        newId,
        JSON.stringify(Object.fromEntries(sources.map((row) => [row.id, row.status]))),
        now,
        auto ? SYSTEM_ACTOR : actor,
        proposal.id,
      ),
  ];
  if (userBy) statements.push(...sourceIds.map((id) => touchIdea(id, now, userBy)));
  await db().batch(statements);
  return newId;
}

// Kabul edilen özellik önerisi skeleton repoda issue olur.
async function createFeatureIssue(token: string, repoUrl: string, title: string, body: string) {
  const repo = parseRepoUrl(repoUrl);
  if (!repo) throw new ProposalError(`Repo adresi anlaşılamadı: ${repoUrl}`);
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "app-idea-factory-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new ProposalError(`GitHub issue açılamadı (HTTP ${res.status}).`);
  return ((await res.json()) as { html_url: string }).html_url;
}

function featureIssueBody(payload: { title: string; description: string }, reason: string, source: IdeaRow) {
  return [
    payload.description,
    "",
    `**Neden:** ${reason}`,
    "",
    `**Kaynak fikir:** ${source.name} — ${source.one_liner}`,
    "",
    "_app-idea-factory havuz bakımı önerisi._",
  ].join("\n");
}

app.get("/admin/merge/due", requireWorkflowSecret, async (_req, res) => {
  const { merge_interval_days: intervalDays } = await maintenanceSettings();
  const last = await db()
    .prepare("SELECT started_at FROM cron_runs WHERE kind = 'merge' AND status = 'success' ORDER BY started_at DESC LIMIT 1")
    .first<{ started_at: string }>();
  const lastAt = last ? toUtcIso(last.started_at) : null;
  // Cron her gün aynı saatte çalışır ama başlangıç birkaç dakika kayabilir;
  // 2 saatlik pay olmasa 3 günlük aralık 4 güne kayardı.
  const due = !lastAt || Date.now() - Date.parse(lastAt) >= intervalDays * 86_400_000 - 2 * 3_600_000;
  res.json({ due, last_success_at: lastAt, interval_days: intervalDays });
});

app.get("/admin/merge/input", requireWorkflowSecret, async (_req, res) => {
  const statuses = [...POOL_STATUSES, ...DEV_FLOW_STATUSES];
  const [ideasResult, tasksResult, proposalsResult] = await db().batch([
    db()
      .prepare(`SELECT * FROM ideas WHERE status IN (${placeholders(statuses.length)}) ORDER BY created_at`)
      .bind(...statuses),
    db().prepare("SELECT idea_id, params FROM tasks"),
    db().prepare("SELECT * FROM pool_proposals WHERE status != 'undone'"),
  ]);
  const ideas = ideasResult.results as IdeaRow[];
  const tasks = new Map(
    (tasksResult.results as { idea_id: string; params: string }[]).map((t) => [t.idea_id, JSON.parse(t.params)]),
  );
  const proposals = (proposalsResult.results as ProposalRow[]).map(serializeProposal);
  const pending = new Set(proposals.filter((p) => p.status === "pending").flatMap((p) => p.source_ids));

  res.json({
    pool: ideas
      .filter((row) => isPoolStatus(row.status) && !pending.has(row.id))
      .map((row) => {
        const scores = JSON.parse(row.scores) as Record<string, unknown> | null;
        return {
          id: row.id,
          batch_date: row.batch_date,
          status: row.status,
          name: row.name,
          one_liner: row.one_liner,
          problem: row.problem,
          target_audience: row.target_audience,
          core_features: JSON.parse(row.core_features),
          monetization: row.monetization,
          category: row.category,
          tags: JSON.parse(row.tags),
          inspiration_sources: JSON.parse(row.inspiration_sources),
          overall: (scores?.overall as number | undefined) ?? null,
          user_rating: row.user_rating,
          user_note: row.user_note,
        };
      }),
    dev_ideas: ideas
      .filter((row) => isDevFlowStatus(row.status))
      .map((row) => ({
        id: row.id,
        status: row.status,
        name: row.name,
        one_liner: row.one_liner,
        problem: row.problem,
        category: row.category,
        core_features: JSON.parse(row.core_features),
        mvp_features: (tasks.get(row.id)?.mvp_features as string[] | undefined) ?? [],
      })),
    // Tekrar önerilmesin diye: reddedilen birleştirme grupları ve daha önce
    // önerilmiş (bekleyen, kabul ya da reddedilmiş) özellikler.
    rejected_merges: proposals.filter((p) => p.kind === "merge" && p.status === "rejected").map((p) => p.source_ids),
    previous_features: proposals
      .filter((p) => p.kind === "feature")
      .map((p) => ({
        source_id: p.source_ids[0],
        target_idea_id: p.target_idea_id,
        title: (p.payload as { title: string }).title,
        status: p.status,
      })),
  });
});

app.post("/admin/merge/proposals", requireWorkflowSecret, async (req, res) => {
  const parsed = proposalsSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const { run_id: runId, merges, features } = parsed.data;
  const referenced = new Set([
    ...merges.flatMap((m) => m.source_ids),
    ...features.flatMap((f) => [f.source_id, f.target_idea_id]),
  ]);
  const rows = new Map((await ideasByIds([...referenced])).map((row) => [row.id, row]));
  const pending = await pendingProposalIdeaIds();
  const used = new Set<string>();
  const skipped: string[] = [];

  // Geçersiz öneri tüm koşuyu düşürmez, atlanır ve sebebi döner.
  const sourceProblem = (id: string) => {
    const row = rows.get(id);
    if (!row) return `${id} bulunamadı`;
    if (!isPoolStatus(row.status)) return `${row.name} Fikirler listesinde değil`;
    if (pending.has(id)) return `${row.name} zaten bekleyen bir öneride`;
    if (used.has(id)) return `${row.name} birden fazla öneride`;
    return null;
  };

  const now = new Date().toISOString();
  const inserted: { id: string; kind: "merge" | "feature"; autoEligible: boolean }[] = [];
  const statements: D1PreparedStatement[] = [];
  const insert = (
    kind: "merge" | "feature",
    sourceIds: string[],
    targetId: string | null,
    payload: unknown,
    reason: string,
  ) => {
    const id = crypto.randomUUID();
    statements.push(
      db()
        .prepare(
          `INSERT INTO pool_proposals (id, run_id, kind, status, source_ids, target_idea_id, payload, reason, created_at)
           VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(id, runId ?? null, kind, JSON.stringify(sourceIds), targetId, JSON.stringify(payload), reason, now),
    );
    sourceIds.forEach((s) => used.add(s));
    inserted.push({ id, kind, autoEligible: kind === "merge" && sourceIds.every((s) => untouched(rows.get(s)!)) });
  };

  for (const merge of merges) {
    const ids = [...new Set(merge.source_ids)];
    const problem = ids.length < 2 ? "birleştirmede en az 2 farklı fikir olmalı" : ids.map(sourceProblem).find(Boolean);
    if (problem) {
      skipped.push(`Birleştirme "${merge.idea.name}" atlandı: ${problem}`);
      continue;
    }
    insert("merge", ids, null, merge.idea, merge.reason);
  }
  for (const feature of features) {
    const target = rows.get(feature.target_idea_id);
    const problem =
      sourceProblem(feature.source_id) ??
      (!target || !isDevFlowStatus(target.status) ? "hedef fikir geliştirme akışında değil" : null);
    if (problem) {
      skipped.push(`Özellik önerisi "${feature.title}" atlandı: ${problem}`);
      continue;
    }
    insert(
      "feature",
      [feature.source_id],
      feature.target_idea_id,
      { title: feature.title, description: feature.description },
      feature.reason,
    );
  }
  if (statements.length > 0) await db().batch(statements);

  // El değmemiş fikirlerin birleştirmesi hemen uygulanır. Uygulanamazsa
  // (ör. ad çakışması) öneri sebebiyle birlikte onay bekler.
  let applied = 0;
  for (const item of inserted.filter((i) => i.autoEligible)) {
    const proposal = await db().prepare("SELECT * FROM pool_proposals WHERE id = ?1").bind(item.id).first<ProposalRow>();
    try {
      await applyMerge(proposal!, SYSTEM_ACTOR, true);
      applied++;
    } catch (err) {
      if (!(err instanceof ProposalError)) throw err;
      await db().prepare("UPDATE pool_proposals SET error = ?1 WHERE id = ?2").bind(err.message, item.id).run();
    }
  }

  const mergeCount = inserted.filter((i) => i.kind === "merge").length;
  res.status(201).json({
    merges_applied: applied,
    merges_pending: mergeCount - applied,
    features: inserted.length - mergeCount,
    skipped,
  });
});

app.get("/proposals", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const { results } = status
    ? await db()
        .prepare("SELECT * FROM pool_proposals WHERE status = ?1 ORDER BY created_at DESC LIMIT 200")
        .bind(status)
        .all<ProposalRow>()
    : await db().prepare("SELECT * FROM pool_proposals ORDER BY created_at DESC LIMIT 200").all<ProposalRow>();
  res.json(await proposalsResponse(results));
});

// Detay sayfası: bu fikrin kaynağı/hedefi olduğu öneriler ve (birleşik fikirse)
// birleştirilen fikirler.
app.get("/ideas/:id/proposals", async (req, res) => {
  const id = req.params.id;
  const [proposalsResult, mergedFromResult] = await db().batch([
    db()
      .prepare(
        `SELECT p.* FROM pool_proposals p
         WHERE p.target_idea_id = ?1 OR EXISTS (SELECT 1 FROM json_each(p.source_ids) WHERE value = ?1)
         ORDER BY p.created_at DESC`,
      )
      .bind(id),
    db().prepare("SELECT * FROM ideas WHERE merged_into_id = ?1 ORDER BY created_at").bind(id),
  ]);
  res.json({
    ...(await proposalsResponse(proposalsResult.results as ProposalRow[])),
    merged_from: (mergedFromResult.results as IdeaRow[]).map(ideaSummary),
  });
});

async function loadPendingProposal(id: string, kind: "merge" | "feature") {
  const row = await db().prepare("SELECT * FROM pool_proposals WHERE id = ?1").bind(id).first<ProposalRow>();
  if (!row || row.kind !== kind) return { error: 404 as const };
  if (row.status !== "pending") return { error: 409 as const };
  return { row };
}

app.post("/proposals/:id/apply", async (req, res) => {
  const { row, error } = await loadPendingProposal(req.params.id, "merge");
  if (!row) {
    res.status(error).json({ error: error === 404 ? "not_found" : "not_pending" });
    return;
  }
  try {
    const ideaId = await applyMerge(row, actorOf(res), false);
    res.json({ ok: true, idea_id: ideaId });
  } catch (err) {
    if (!(err instanceof ProposalError)) throw err;
    await db().prepare("UPDATE pool_proposals SET error = ?1 WHERE id = ?2").bind(err.message, row.id).run();
    res.status(409).json({ error: "cannot_apply", message: err.message });
  }
});

app.post("/proposals/:id/reject", async (req, res) => {
  const row = await db().prepare("SELECT * FROM pool_proposals WHERE id = ?1").bind(req.params.id).first<ProposalRow>();
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (row.status !== "pending") {
    res.status(409).json({ error: "not_pending" });
    return;
  }
  await db()
    .prepare("UPDATE pool_proposals SET status = 'rejected', decided_at = ?1, decided_by = ?2 WHERE id = ?3")
    .bind(new Date().toISOString(), actorOf(res), row.id)
    .run();
  res.json({ ok: true });
});

// Uygulanmış birleştirmeyi geri alır: kaynaklar eski durumlarına döner,
// birleşik fikir silinir. Birleşik fikir geliştirmeye alındıysa geri alınamaz.
app.post("/proposals/:id/undo", async (req, res) => {
  const row = await db().prepare("SELECT * FROM pool_proposals WHERE id = ?1").bind(req.params.id).first<ProposalRow>();
  if (!row || row.kind !== "merge") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const merged = row.target_idea_id
    ? await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(row.target_idea_id).first<IdeaRow>()
    : null;
  if (row.status !== "applied" || !merged || !isPoolStatus(merged.status)) {
    res.status(409).json({
      error: "cannot_undo",
      message: "Yalnızca birleşik fikir hâlâ Fikirler listesindeyken geri alınabilir.",
    });
    return;
  }

  const now = new Date().toISOString();
  const actor = actorOf(res);
  const previous = (row.source_prev_statuses ? JSON.parse(row.source_prev_statuses) : {}) as Record<string, string>;
  const sourceIds = JSON.parse(row.source_ids) as string[];
  await db().batch([
    db()
      .prepare("UPDATE ideas SET status = 'deleted', deleted_at = ?1, updated_at = ?1, updated_by = ?2 WHERE id = ?3")
      .bind(now, actor, merged.id),
    ...sourceIds.map((id) =>
      db()
        .prepare(
          `UPDATE ideas SET status = ?1, merged_into_id = NULL, updated_at = ?2, updated_by = ?3
           WHERE id = ?4 AND status = 'merged' AND merged_into_id = ?5`,
        )
        .bind(previous[id] ?? "new", now, actor, id, merged.id),
    ),
    db()
      .prepare("UPDATE pool_proposals SET status = 'undone', decided_at = ?1, decided_by = ?2 WHERE id = ?3")
      .bind(now, actor, row.id),
  ]);
  res.json({ ok: true });
});

// Özellik önerisini kabul eder: hedefin skeleton reposu varsa orada issue
// açılır, kaynak havuz fikri 'merged' olup hedefe bağlanır. Repo henüz yoksa
// issue iskelet kurulurken açılır (prepare-skeleton-repo.ts).
app.post("/proposals/:id/accept", async (req, res) => {
  const { row, error } = await loadPendingProposal(req.params.id, "feature");
  if (!row) {
    res.status(error).json({ error: error === 404 ? "not_found" : "not_pending" });
    return;
  }
  const [sourceId] = JSON.parse(row.source_ids) as string[];
  const [source] = await ideasByIds([sourceId]);
  const target = row.target_idea_id ? (await ideasByIds([row.target_idea_id]))[0] : undefined;
  if (!source || !isPoolStatus(source.status) || !target || !isDevFlowStatus(target.status)) {
    res.status(409).json({
      error: "cannot_accept",
      message: "Kaynak fikir artık Fikirler listesinde değil ya da hedef fikir geliştirme akışından çıkmış.",
    });
    return;
  }

  const payload = JSON.parse(row.payload) as { title: string; description: string };
  const task = await db()
    .prepare("SELECT repo_url FROM tasks WHERE idea_id = ?1")
    .bind(target.id)
    .first<{ repo_url: string | null }>();
  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  let issueUrl: string | null = null;
  if (task?.repo_url) {
    if (!GH_WORKFLOW_DISPATCH_TOKEN) {
      res.status(500).json({ error: "not_configured", message: "GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı yok." });
      return;
    }
    try {
      issueUrl = await createFeatureIssue(
        GH_WORKFLOW_DISPATCH_TOKEN,
        task.repo_url,
        payload.title,
        featureIssueBody(payload, row.reason, source),
      );
    } catch (err) {
      if (!(err instanceof ProposalError)) throw err;
      res.status(502).json({ error: "github_issue_failed", message: err.message });
      return;
    }
  }

  const now = new Date().toISOString();
  const actor = actorOf(res);
  await db().batch([
    db()
      .prepare("UPDATE ideas SET status = 'merged', merged_into_id = ?1 WHERE id = ?2")
      .bind(target.id, source.id),
    touchIdea(source.id, now, actor),
    db()
      .prepare(
        `UPDATE pool_proposals SET status = 'applied', issue_url = ?1, source_prev_statuses = ?2,
           decided_at = ?3, decided_by = ?4, error = NULL WHERE id = ?5`,
      )
      .bind(issueUrl, JSON.stringify({ [source.id]: source.status }), now, actor, row.id),
  ]);
  res.json({ ok: true, issue_url: issueUrl });
});

// Bakım koşusunun sonu (submit-proposals'tan sonra):
// 1. Süresi dolan arşivlenmiş ve silinmiş fikirler kalıcı silinir; normalize
//    adları retired_names'e yazılır (isim tekrarı kontrolü sürsün).
// 2. Havuzdaki 'new' fikirlerin bakım puanı sayılır: 7.00'ın altındaysa
//    stale_runs +1, değilse 0. Askıdakiler, puanlanmamışlar, bekleyen bir
//    öneridekiler ve bu koşuda oluşan birleşik fikirler sayılmaz.
// 3. stale_runs 3'e ulaşan fikir arşivlenir: yalnızca ad, özet, kategori,
//    etiket ve puan sayıları kalır; rakipler ve iş geçmişi silinir.
const MAX_PURGE_PER_RUN = 100;

app.post("/admin/maintenance/finalize", requireWorkflowSecret, async (req, res) => {
  const parsed = maintenanceFinalizeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: z.flattenError(parsed.error) });
    return;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const { purge_after_days: purgeDays } = await maintenanceSettings();
  const cutoff = new Date(now.getTime() - purgeDays * 86_400_000).toISOString();

  // 1. Kalıcı silme. Birleştirilmiş fikirlerin hedefi olan fikirler (kaynakları
  // ona bağlı) silinmez.
  const { results: purgeRows } = await db()
    .prepare(
      `SELECT i.id, i.name, i.status, i.archived_at, i.deleted_at, i.status_changed_at, i.created_at
       FROM ideas i
       WHERE i.status IN ('archived', 'deleted')
         AND NOT EXISTS (SELECT 1 FROM ideas m WHERE m.merged_into_id = i.id)`,
    )
    .all<{
      id: string;
      name: string;
      status: string;
      archived_at: string | null;
      deleted_at: string | null;
      status_changed_at: string | null;
      created_at: string;
    }>();
  const toPurge = purgeRows
    .filter((row) => {
      const since =
        row.status === "archived" ? row.archived_at : (row.deleted_at ?? row.status_changed_at ?? row.created_at);
      return since != null && (toUtcIso(since) ?? since) <= cutoff;
    })
    .slice(0, MAX_PURGE_PER_RUN);
  if (toPurge.length > 0) {
    const statements: D1PreparedStatement[] = [];
    for (const row of toPurge) {
      const retired = normalizeName(row.name);
      if (retired) {
        statements.push(
          db().prepare("INSERT OR IGNORE INTO retired_names (name, retired_at) VALUES (?1, ?2)").bind(retired, nowIso),
        );
      }
      statements.push(
        db().prepare("DELETE FROM task_documents WHERE task_id IN (SELECT id FROM tasks WHERE idea_id = ?1)").bind(row.id),
        db().prepare("DELETE FROM tasks WHERE idea_id = ?1").bind(row.id),
        db().prepare("DELETE FROM workflow_runs WHERE idea_id = ?1").bind(row.id),
        db().prepare("DELETE FROM idea_competitors WHERE idea_id = ?1").bind(row.id),
        db().prepare("DELETE FROM idea_seen WHERE idea_id = ?1").bind(row.id),
        db().prepare("DELETE FROM ideas WHERE id = ?1").bind(row.id),
      );
    }
    await db().batch(statements);
  }

  // 2. Sayaç. Bu koşuda oluşan fikirler (birleşik fikirler) koşunun başladığı
  // andan sonra yaratıldığı için dışarıda kalır.
  const run = parsed.data.run_id
    ? await db().prepare("SELECT started_at FROM cron_runs WHERE id = ?1").bind(parsed.data.run_id).first<{ started_at: string }>()
    : null;
  const runStart = run ? (toUtcIso(run.started_at) ?? nowIso) : nowIso;
  const pending = await pendingProposalIdeaIds();
  const { results: pool } = await db()
    .prepare("SELECT id, scores, user_rating, stale_runs, created_at FROM ideas WHERE status = 'new'")
    .all<{ id: string; scores: string; user_rating: number | null; stale_runs: number; created_at: string }>();

  const counted: { id: string; staleRuns: number }[] = [];
  for (const row of pool) {
    if (pending.has(row.id) || (toUtcIso(row.created_at) ?? row.created_at) >= runStart) continue;
    const scores = JSON.parse(row.scores) as { overall?: number } | null;
    if (scores?.overall == null) continue;
    const low = maintenanceScore(scores.overall, row.user_rating) < ARCHIVE_SCORE_THRESHOLD;
    counted.push({ id: row.id, staleRuns: low ? row.stale_runs + 1 : 0 });
  }

  // 3. Arşivleme. Puan gerekçeleri boşaltılır, sayılar kalır.
  const statements: D1PreparedStatement[] = [];
  let archived = 0;
  for (const { id, staleRuns } of counted) {
    if (staleRuns < ARCHIVE_AFTER_RUNS) {
      statements.push(db().prepare("UPDATE ideas SET stale_runs = ?1 WHERE id = ?2").bind(staleRuns, id));
      continue;
    }
    archived++;
    statements.push(
      db()
        .prepare(
          `UPDATE ideas SET status = 'archived', archived_at = ?1, stale_runs = ?2,
             problem = '', target_audience = '', core_features = '[]', monetization = '',
             inspiration_sources = '[]', user_note = NULL, source_text = NULL,
             scores = CASE WHEN json_valid(scores) AND json_type(scores) = 'object' THEN json_set(scores,
               '$.market_reason', '', '$.feasibility_solo_dev_reason', '',
               '$.originality_reason', '', '$.overall_reason', '') ELSE scores END
           WHERE id = ?3`,
        )
        .bind(nowIso, staleRuns, id),
      db().prepare("DELETE FROM idea_competitors WHERE idea_id = ?1").bind(id),
      db().prepare("DELETE FROM workflow_runs WHERE idea_id = ?1").bind(id),
    );
  }
  if (statements.length > 0) await db().batch(statements);

  res.json({
    purged: toPurge.length,
    archived,
    approaching: counted.filter((c) => c.staleRuns > 0 && c.staleRuns < ARCHIVE_AFTER_RUNS).length,
  });
});

// Arşivden geri getirme: fikir havuza döner ve kalan özetten Claude boşalan
// alanları yeniden doldurur (evaluate-idea.yml "doldurma modu": source_text
// dolu ve puan yok). Ad korunur.
app.post("/ideas/:id/restore", async (req, res) => {
  const idea = await db().prepare("SELECT * FROM ideas WHERE id = ?1").bind(req.params.id).first<IdeaRow>();
  if (!idea) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (idea.status !== "archived") {
    res.status(409).json({ error: "not_archived", message: "Yalnızca arşivlenmiş fikir geri getirilebilir." });
    return;
  }
  const { GH_WORKFLOW_DISPATCH_TOKEN } = env as unknown as Env;
  if (!GH_WORKFLOW_DISPATCH_TOKEN) {
    res.status(500).json({ error: "not_configured", message: "GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı yok." });
    return;
  }

  const tags = JSON.parse(idea.tags) as string[];
  const sourceText = [
    `${idea.name}: ${idea.one_liner}`,
    idea.category ? `Kategori: ${idea.category}` : null,
    tags.length > 0 ? `Etiketler: ${tags.join(", ")}` : null,
    "(Arşivden geri getirildi; yalnızca bu özet kalmıştı.)",
  ]
    .filter(Boolean)
    .join("\n");
  const now = new Date().toISOString();
  const actor = actorOf(res);
  await db().batch([
    db()
      .prepare(
        `UPDATE ideas SET status = 'new', archived_at = NULL, stale_runs = 0, source_text = ?1, scores = 'null'
         WHERE id = ?2`,
      )
      .bind(sourceText, idea.id),
    touchIdea(idea.id, now, actor),
  ]);

  const job = await queueIdeaJob(GH_WORKFLOW_DISPATCH_TOKEN, "evaluate-idea.yml", idea.id, actor);
  res.json({
    ok: true,
    dispatch_error: job.ok ? null : `Claude işi tetiklenemedi (GitHub HTTP ${job.status}); detay sayfasından tekrar deneyebilirsin.`,
  });
});

export default app;
