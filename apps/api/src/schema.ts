import { z } from "zod";

// docs/PROJE.md "Fikir şeması" bölümüne karşılık gelir.
// Puanlar 0.00-10.00 arasında, 0.25 adımlarla (41 durak) veriliyor.
const scoreValue = z.number().min(0).max(10).multipleOf(0.25);

export const ideaScoresSchema = z.object({
  market: scoreValue,
  market_reason: z.string().min(1),
  feasibility_solo_dev: scoreValue,
  feasibility_solo_dev_reason: z.string().min(1),
  originality: scoreValue,
  originality_reason: z.string().min(1),
  overall: scoreValue,
  overall_reason: z.string().min(1),
});

export const ideaInputSchema = z.object({
  name: z.string().min(1),
  one_liner: z.string().min(1),
  problem: z.string().min(1),
  target_audience: z.string().min(1),
  core_features: z.array(z.string().min(1)).min(1),
  monetization: z.string().min(1),
  category: z.string().min(1),
  inspiration_sources: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string().min(1)).min(1),
  scores: ideaScoresSchema,
});

export const ideaBatchRequestSchema = z.object({
  batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD olmalı"),
  ideas: z.array(ideaInputSchema).min(1),
});

export const ideaPatchSchema = z
  .object({
    user_rating: scoreValue.nullable().optional(),
    user_note: z.string().nullable().optional(),
    status: z.enum(["new", "on_hold", "deleted", "in_development", "developed"]).optional(),
    // Detay sayfası açılınca gönderilir: son aktiviteyi "görüldü" yapar
    // (fikir listesindeki okunmamış noktası kalkar). Aktivite damgalamaz.
    mark_seen: z.literal(true).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "En az bir alan gönderilmeli");

export type IdeaInput = z.infer<typeof ideaInputSchema>;
export type IdeaBatchRequest = z.infer<typeof ideaBatchRequestSchema>;
export type IdeaPatch = z.infer<typeof ideaPatchSchema>;

// Grup 3: ayarlar (kaynak aç/kapat) ve cron geçmişi.
export const SOURCE_SETTING_KEYS = [
  "source_reddit_enabled",
  "source_appstore_enabled",
  "source_producthunt_enabled",
  "source_hackernews_enabled",
] as const;

export const settingsPatchSchema = z.object({
  key: z.enum(SOURCE_SETTING_KEYS),
  value: z.boolean(),
});

export const cronRunPatchSchema = z
  .object({
    status: z.enum(["success", "failed"]),
    source_breakdown: z.record(z.string(), z.number().int().min(0)).optional(),
    error: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "En az bir alan gönderilmeli");

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type CronRunPatch = z.infer<typeof cronRunPatchSchema>;

// Grup 3: GitHub workflow_dispatch tetikleme (cron, yeniden değerlendirme,
// rakip bulma — hepsi aynı mekanizma).
export const DISPATCHABLE_WORKFLOWS = ["daily-ideas.yml", "reevaluate-idea.yml", "find-competitors.yml"] as const;

export const triggerWorkflowSchema = z.object({
  workflow: z.enum(DISPATCHABLE_WORKFLOWS),
  inputs: z.record(z.string(), z.string()).optional(),
});

export type TriggerWorkflow = z.infer<typeof triggerWorkflowSchema>;

// Grup 4: notlarla yeniden değerlendirme — scores aynı şema, ideaInputSchema
// gibi tüm fikri değil sadece puan+gerekçe+tag alanlarını günceller.
// change_summary: prompts/reevaluate-idea.md'nin zorunlu kıldığı, notun nasıl
// yorumlandığını ve hangi puanların neden değiştiğini özetleyen alan.
export const reevaluationSchema = z.object({
  scores: ideaScoresSchema,
  tags: z.array(z.string().min(1)).min(1).optional(),
  change_summary: z.string().min(1),
});

export type Reevaluation = z.infer<typeof reevaluationSchema>;

// Grup 4: rakip/benzer uygulama bulma. prompts/find-competitors.md'deki
// şemaya göre url, similarity ve note zorunlu; en fazla 5 sonuç.
export const COMPETITOR_SIMILARITIES = ["direct", "partial", "alternative"] as const;

export const competitorSchema = z.object({
  app_name: z.string().min(1),
  url: z.url(),
  similarity: z.enum(COMPETITOR_SIMILARITIES),
  note: z.string().min(1),
});

export const competitorsSubmitSchema = z.object({
  idea_id: z.string().min(1),
  competitors: z.array(competitorSchema).max(5),
});

export type CompetitorsSubmit = z.infer<typeof competitorsSubmitSchema>;

// Grup 4: trend_snapshots'ın gerçekten kullanılması.
export const trendSnapshotsSubmitSchema = z.object({
  cron_run_id: z.string().min(1).optional(),
  snapshots: z
    .array(
      z.object({
        source: z.string().min(1),
        payload: z.unknown(),
      }),
    )
    .min(1),
});

export type TrendSnapshotsSubmit = z.infer<typeof trendSnapshotsSubmitSchema>;

// 2. tur Grup C: fikir bazlı arka plan işleri (workflow_runs) ve fikir
// listesindeki aktivite rozeti.
// plan-idea.yml (Faz 3A) burada ama DISPATCHABLE_WORKFLOWS'ta değil: yalnızca
// POST /tasks üzerinden (görev formu kaydedilerek) tetiklenebilir.
export const IDEA_WORKFLOWS = ["reevaluate-idea.yml", "find-competitors.yml", "plan-idea.yml"] as const;
export type IdeaWorkflow = (typeof IDEA_WORKFLOWS)[number];

export const ACTIVITY_KINDS = [
  "note_updated",
  "rating_updated",
  "status_changed",
  "reevaluate_queued",
  "reevaluated",
  "reevaluate_failed",
  "competitors_queued",
  "competitors_found",
  "competitors_failed",
  "plan_queued",
  "planned",
  "plan_failed",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// Workflow → [kuyruğa alındı, başarılı, başarısız] aktivite türleri.
export const WORKFLOW_ACTIVITY: Record<IdeaWorkflow, [ActivityKind, ActivityKind, ActivityKind]> = {
  "reevaluate-idea.yml": ["reevaluate_queued", "reevaluated", "reevaluate_failed"],
  "find-competitors.yml": ["competitors_queued", "competitors_found", "competitors_failed"],
  "plan-idea.yml": ["plan_queued", "planned", "plan_failed"],
};

export const workflowRunPatchSchema = z.object({
  status: z.enum(["running", "success", "failed"]),
  run_url: z.string().optional(),
  error: z.string().nullable().optional(),
});

export type WorkflowRunPatch = z.infer<typeof workflowRunPatchSchema>;

// job_id'siz başlayan işler (GitHub arayüzünden elle çalıştırma, gh workflow run)
// kendi satırlarını açar ki ekranda son iş olarak görünsünler.
export const workflowRunCreateSchema = z.object({
  workflow: z.enum(IDEA_WORKFLOWS),
  idea_id: z.string().min(1),
  run_url: z.string().optional(),
});

// Faz 3A: "Geliştir" görev formu (docs/PROJE.md "Görev formu alanları") ve
// Claude'un ürettiği planlama belgeleri. scripts/lib/task-schema.ts ile aynı
// olmalı — paketler arası paylaşım yok, ikisini birlikte güncelle.
export const TASK_PLATFORMS = ["ios_swift", "android_kotlin", "expo", "flutter"] as const;
export const TASK_BACKENDS = ["none", "supabase", "firebase", "custom_api"] as const;
export const TASK_AUTHS = ["none", "email", "social"] as const;
export const TASK_THEMES = ["light", "dark", "both"] as const;
export const TASK_STYLES = ["minimal", "colorful"] as const;

export const taskParamsSchema = z.object({
  platform: z.enum(TASK_PLATFORMS),
  backend: z.enum(TASK_BACKENDS),
  auth: z.enum(TASK_AUTHS),
  // Fikrin core_features'ından seçilenler + kullanıcının serbest eklemeleri
  // (3-5 önerilir, form bunu uyarı olarak gösterir; sınır daha geniş).
  mvp_features: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  design: z.object({
    theme: z.enum(TASK_THEMES),
    style: z.enum(TASK_STYLES),
  }),
  notes: z.string().max(4000).optional(),
});

export type TaskParams = z.infer<typeof taskParamsSchema>;

export const taskCreateSchema = z.object({
  idea_id: z.string().min(1),
  params: taskParamsSchema,
});

export const TASK_STATUSES = ["planning", "planning_failed", "ready", "queued", "running", "done", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Belgeleri yeniden üretmeye / formu tekrar göndermeye izin verilen durumlar.
// queued ve sonrası: iskelet üretimine geçildi, belgeler kilitli.
export const TASK_REPLANNABLE_STATUSES: readonly TaskStatus[] = ["planning_failed", "ready"];

export const DOCUMENT_KINDS = ["prd", "screens", "tech_plan", "roadmap"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const documentContent = z.string().trim().min(1).max(200_000);

export const taskDocumentsSubmitSchema = z.object({
  idea_id: z.string().min(1),
  documents: z.object({
    prd: documentContent,
    screens: documentContent,
    tech_plan: documentContent,
    roadmap: documentContent,
  }),
});
