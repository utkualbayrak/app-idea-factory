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

// Fikir durumları. D1'de CHECK yok (0008), geçerlilik burada tek yerde.
// Akış: new/on_hold → awaiting_development → in_development → awaiting_test
// → testing → approved; testten geri gönderilen fikir rework olur.
export const IDEA_STATUSES = [
  "new",
  "on_hold",
  "deleted",
  "awaiting_development",
  "in_development",
  "rework",
  "awaiting_test",
  "testing",
  "approved",
  // Havuz bakımı (0016): başka bir fikre birleştirildi / gözden düştü.
  "merged",
  "archived",
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

// PATCH /ideas/:id ile kullanıcının yapabileceği durum geçişleri. Geliştirme
// akışına giriş/çıkış (awaiting_development, in_development) görev uçlarından
// geçer; test akışı (testing, approved, rework) Grup 4'te kendi uçlarına
// taşınacak. Burada olmayan geçiş 409 döner.
export const USER_STATUS_TRANSITIONS: Record<IdeaStatus, readonly IdeaStatus[]> = {
  new: ["on_hold", "deleted"],
  on_hold: ["new", "deleted"],
  deleted: [],
  awaiting_development: [],
  // → awaiting_test yalnızca "Geliştirildi" formuyla (POST /ideas/:id/dev-report).
  in_development: [],
  rework: [],
  // Test başlamadan geri alma. Rapor kalır; bir sonraki "Geliştirildi"
  // gönderimi yeni tur açmak yerine o raporun üzerine yazar.
  awaiting_test: ["in_development"],
  testing: [],
  approved: [],
  // Birleştirmeyi geri alma ve arşivden geri getirme kendi uçlarından geçer.
  merged: [],
  archived: [],
};

// Fikirler listesindeki (havuzdaki) durumlar; havuz bakımı yalnızca bunlara bakar.
export const POOL_STATUSES: readonly IdeaStatus[] = ["new", "on_hold"];
// Geliştirme akışındaki durumlar: havuz bakımı bunlara özellik önerebilir.
export const DEV_FLOW_STATUSES: readonly IdeaStatus[] = [
  "awaiting_development",
  "in_development",
  "rework",
  "awaiting_test",
  "testing",
  "approved",
];

// Faz 3 sonrası tur, Grup 3: "Geliştirildi" formu. Serbest metin alanı yok —
// her şey kısa satırlar halinde (kullanıcı isteği: "form şeklinde olsun").
const shortLine = z.string().trim().min(1).max(300);

export const devReportSubmitSchema = z.object({
  roadmap_source: z.enum(["repo", "approved"]).nullable(),
  roadmap_items: z
    .array(
      z.object({
        phase: z.string().trim().max(200).nullable(),
        text: z.string().trim().min(1).max(500),
        done: z.boolean(),
      }),
    )
    .max(200),
  missing_features: z.array(shortLine).max(30),
  extra_features: z.array(shortLine).max(30),
  notes: z.array(shortLine).max(30),
});

// Faz 3 sonrası tur, Grup 4: test turları.
export const TEST_PLATFORMS = ["ios", "android", "web"] as const;
export const TEST_CHANNELS = ["testflight", "play_internal", "expo_go", "direct_install", "web_url", "other"] as const;
export const SCENARIO_RESULTS = ["passed", "partial", "failed", "skipped"] as const;
export const FINDING_SEVERITIES = ["critical", "major", "minor"] as const;
export const FINDING_KINDS = ["bug", "ux", "feature_request", "performance", "other"] as const;
// "both" eski adıyla kalır; anlamı "tüm platformlar".
export const FINDING_PLATFORMS = ["ios", "android", "web", "both"] as const;

export const testPlanSchema = z.object({
  tester_count: z.number().int().min(1).max(1000),
  duration_days: z.number().int().min(1).max(365),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD olmalı"),
  platforms: z.array(z.enum(TEST_PLATFORMS)).min(1).max(3),
  channel: z.enum(TEST_CHANNELS),
  scenarios: z.array(shortLine).min(1).max(30),
  success_criteria: z.array(shortLine).max(20),
});

export const testFindingSchema = z.object({
  severity: z.enum(FINDING_SEVERITIES),
  kind: z.enum(FINDING_KINDS),
  platform: z.enum(FINDING_PLATFORMS),
  text: shortLine,
});

export const testResultSchema = z.object({
  actual_tester_count: z.number().int().min(0).max(1000),
  actual_days: z.number().int().min(0).max(365),
  scenario_results: z.array(z.object({ scenario: shortLine, result: z.enum(SCENARIO_RESULTS) })).max(30),
  findings: z.array(testFindingSchema).max(100),
  satisfaction: scoreValue.nullable(),
});

export const testResultSubmitSchema = z
  .object({
    result: testResultSchema,
    decision: z.enum(["approved", "rework"]),
    rework_reason: z
      .object({
        summary: shortLine,
        // result.findings içindeki indeksler: geliştirmede ele alınacak bulgular.
        finding_indexes: z.array(z.number().int().min(0)).max(100),
      })
      .optional(),
  })
  .refine((d) => d.decision !== "rework" || d.rework_reason != null, {
    message: "Geri göndermede sebep zorunlu",
    path: ["rework_reason"],
  })
  .refine((d) => (d.rework_reason?.finding_indexes ?? []).every((i) => i < d.result.findings.length), {
    message: "Geçersiz bulgu indeksi",
    path: ["rework_reason", "finding_indexes"],
  });

// Faz 3 sonrası tur, Grup 5: elle fikir girişi. İki yol:
// - "form": tüm alanları kullanıcı girer, puanlar boş kalır ("Claude ile değerlendir").
// - "describe": kullanıcı serbest bir açıklama yazar, evaluate-idea.yml
//   açıklamadan alanları doldurur ve puanlar (oluşturunca otomatik tetiklenir).
export const manualIdeaSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("form"),
    name: z.string().trim().min(1).max(40),
    one_liner: z.string().trim().min(1).max(300),
    problem: z.string().trim().min(1).max(2000),
    target_audience: z.string().trim().min(1).max(1000),
    core_features: z.array(shortLine).min(1).max(10),
    monetization: z.string().trim().min(1).max(1000),
    category: z.string().trim().min(1).max(40),
    tags: z.array(z.string().trim().min(1).max(30)).max(4),
  }),
  z.object({
    mode: z.literal("describe"),
    // Boşsa Claude ad koyar.
    name: z.string().trim().max(40).optional(),
    // Yapıştırılan ya da içe aktarılan Markdown belge (PRD vb.) de olabilir.
    description: z.string().trim().min(30).max(30000),
  }),
]);

// evaluate-idea.yml çıktısı (scripts/lib/idea-schema.ts evaluationSchema ile
// aynı olmalı). fields yalnızca "describe" yolunda, fikir ilk kez
// doldurulurken zorunlu; API diğer durumlarda alanlara dokunmaz.
export const evaluationSchema = z.object({
  scores: ideaScoresSchema,
  tags: z.array(z.string().min(1)).min(1).max(4),
  category: z.string().min(1),
  fields: z
    .object({
      name: z.string().min(1).max(40),
      one_liner: z.string().min(1),
      problem: z.string().min(1),
      target_audience: z.string().min(1),
      core_features: z.array(z.string().min(1)).min(1).max(10),
      monetization: z.string().min(1),
    })
    .optional(),
});

export const ideaPatchSchema = z
  .object({
    user_rating: scoreValue.nullable().optional(),
    user_note: z.string().nullable().optional(),
    status: z.enum(IDEA_STATUSES).optional(),
    // Detay sayfası açılınca gönderilir: son aktiviteyi "görüldü" yapar
    // (fikir listesindeki okunmamış noktası kalkar). Aktivite damgalamaz.
    mark_seen: z.literal(true).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "En az bir alan gönderilmeli");

// "Geliştirme bekliyor" aşamasında fikrin adını değiştirme. Repo adı bu
// addan türetildiği için en az bir ASCII harf/rakam şart.
export const ideaRenameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((name) => /[a-z0-9]/i.test(name), "Ad en az bir harf ya da rakam içermeli"),
  // Planlama belgelerinde eski ad geçen yerleri de yeni adla değiştir.
  update_docs: z.boolean().default(true),
});

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

// Havuz bakımı ayarları (gün). Satır yoksa varsayılan geçerli.
export const MAINTENANCE_SETTING_DEFAULTS = {
  merge_interval_days: 3,
  purge_after_days: 90,
} as const;
export type MaintenanceSettingKey = keyof typeof MAINTENANCE_SETTING_DEFAULTS;

export const settingsPatchSchema = z.union([
  z.object({ key: z.enum(SOURCE_SETTING_KEYS), value: z.boolean() }),
  z.object({ key: z.literal("merge_interval_days"), value: z.number().int().min(1).max(30) }),
  z.object({ key: z.literal("purge_after_days"), value: z.number().int().min(0).max(3650) }),
]);

// status 'running': iş başladı, yalnızca run_url yazılır (kayıt tetiklenirken açıldı).
export const cronRunPatchSchema = z
  .object({
    status: z.enum(["running", "success", "failed"]),
    run_url: z.string().optional(),
    source_breakdown: z.record(z.string(), z.number().int().min(0)).optional(),
    // Havuz bakımı koşusunun sayıları (birleştirme, öneri, arşiv, silme).
    summary: z.record(z.string(), z.number().int().min(0)).optional(),
    error: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "En az bir alan gönderilmeli");

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

// Ayarlar > Kullanıcılar: Access e-postası → arayüzde görünen ad.
export const userNameEmailSchema = z.email().transform((value) => value.toLowerCase());
export const userNamePutSchema = z.object({
  display_name: z.string().trim().min(1).max(40),
});
export type CronRunPatch = z.infer<typeof cronRunPatchSchema>;

export const CRON_RUN_KINDS = ["daily", "merge"] as const;
export const cronRunCreateSchema = z.object({
  kind: z.enum(CRON_RUN_KINDS).optional(),
  run_url: z.string().optional(),
});

// Arayüzden tetiklenen genel işler: kayıt tetikleme anında açılır, aynı tür
// iş çalışırken tekrar tetiklenemez.
export const CRON_WORKFLOWS: Record<string, (typeof CRON_RUN_KINDS)[number]> = {
  "daily-ideas.yml": "daily",
  "merge-ideas.yml": "merge",
};
// Bu süreden eski 'running' kayıt takılmış sayılır (iş timeout'u 30 dk + kuyruk payı).
export const CRON_RUN_STALE_MS = 45 * 60 * 1000;
// Fikir işlerinde aynı iş aynı fikir için bu süre içinde sıradaysa/çalışıyorsa tekrar tetiklenmez.
export const IDEA_JOB_STALE_MS = 60 * 60 * 1000;

// Grup 3: GitHub workflow_dispatch tetikleme (cron, yeniden değerlendirme,
// rakip bulma — hepsi aynı mekanizma).
export const DISPATCHABLE_WORKFLOWS = [
  "daily-ideas.yml",
  "reevaluate-idea.yml",
  "find-competitors.yml",
  "evaluate-idea.yml",
  "merge-ideas.yml",
] as const;

export const triggerWorkflowSchema = z.object({
  workflow: z.enum(DISPATCHABLE_WORKFLOWS),
  inputs: z.record(z.string(), z.string()).optional(),
});

export type TriggerWorkflow = z.infer<typeof triggerWorkflowSchema>;

// Grup 4: notlarla yeniden değerlendirme — scores aynı şema, ideaInputSchema
// gibi tüm fikri değil sadece puan+gerekçe+tag alanlarını günceller.
// change_summary: prompts/reevaluate-idea.md'nin zorunlu kıldığı, notun nasıl
// yorumlandığını ve hangi puanların neden değiştiğini özetleyen alan.
// fields: not bir düzeltme veya pivot önerip metin alanlarından birini
// değiştiriyorsa, yalnızca değişen alanlar (gerisi olduğu gibi kalır).
export const reevaluationFieldsSchema = z
  .object({
    one_liner: z.string().min(1),
    problem: z.string().min(1),
    target_audience: z.string().min(1),
    core_features: z.array(z.string().min(1)).min(1).max(10),
    monetization: z.string().min(1),
  })
  .partial();

export const reevaluationSchema = z.object({
  scores: ideaScoresSchema,
  tags: z.array(z.string().min(1)).min(1).optional(),
  fields: reevaluationFieldsSchema.optional(),
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
// plan-idea.yml (Faz 3A) ve build-skeleton.yml (Faz 3C) burada ama
// DISPATCHABLE_WORKFLOWS'ta değil: yalnızca görev uçları (POST /tasks,
// POST /tasks/:id/build) üzerinden tetiklenebilirler.
export const IDEA_WORKFLOWS = [
  "reevaluate-idea.yml",
  "find-competitors.yml",
  "plan-idea.yml",
  "build-skeleton.yml",
  "evaluate-idea.yml",
] as const;
export type IdeaWorkflow = (typeof IDEA_WORKFLOWS)[number];

export const ACTIVITY_KINDS = [
  "note_updated",
  "rating_updated",
  "status_changed",
  "renamed",
  "reevaluate_queued",
  "reevaluated",
  "reevaluate_failed",
  "competitors_queued",
  "competitors_found",
  "competitors_failed",
  "plan_queued",
  "planned",
  "plan_failed",
  "evaluate_queued",
  "evaluated",
  "evaluate_failed",
  "skeleton_queued",
  "skeleton_built",
  "skeleton_failed",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// Workflow → [kuyruğa alındı, başarılı, başarısız] aktivite türleri.
export const WORKFLOW_ACTIVITY: Record<IdeaWorkflow, [ActivityKind, ActivityKind, ActivityKind]> = {
  "reevaluate-idea.yml": ["reevaluate_queued", "reevaluated", "reevaluate_failed"],
  "find-competitors.yml": ["competitors_queued", "competitors_found", "competitors_failed"],
  "plan-idea.yml": ["plan_queued", "planned", "plan_failed"],
  "build-skeleton.yml": ["skeleton_queued", "skeleton_built", "skeleton_failed"],
  "evaluate-idea.yml": ["evaluate_queued", "evaluated", "evaluate_failed"],
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
// 0018: fikir görselleri. screen = ekran tasarımı (birebir uygulanır),
// inspiration = ilham (havası alınır), asset = uygulamada aynen kullanılacak
// dosya (logo/ikon/illüstrasyon).
export const IMAGE_ROLES = ["screen", "inspiration", "asset"] as const;
export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_IMAGES_PER_IDEA = 12;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
// İskelet aşamasında görseller (belgeler gibi) kilitlidir.
export const TASK_IMAGE_LOCKED_STATUSES = ["queued", "running", "done", "failed"] as const;

export const imageUploadQuerySchema = z.object({
  role: z.enum(IMAGE_ROLES).default("inspiration"),
  caption: z.string().trim().max(200).optional(),
  w: z.coerce.number().int().min(1).max(10000).optional(),
  h: z.coerce.number().int().min(1).max(10000).optional(),
});

export const imagePatchSchema = z
  .object({
    role: z.enum(IMAGE_ROLES).optional(),
    caption: z.string().trim().max(200).nullable().optional(),
    position: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Boş istek" });

export const TASK_PLATFORMS = ["ios_swift", "android_kotlin", "expo", "flutter", "web"] as const;
export const TASK_BACKENDS = ["none", "supabase", "firebase", "custom_api"] as const;
export const TASK_AUTHS = ["none", "email", "social"] as const;
export const TASK_THEMES = ["light", "dark", "both"] as const;
// minimal/colorful ilk iki değerdi; eski görevler için yerlerinde kalır.
export const TASK_STYLES = ["native", "minimal", "soft", "colorful", "editorial", "professional", "playful"] as const;
export const TASK_GAMIFICATIONS = ["none", "light", "full"] as const;
export const TASK_DENSITIES = ["airy", "balanced", "compact"] as const;
// Faz 3 sonrası tur, Grup 6: hedef cihazlar. Native seçenekler ve web hedefi
// kendisi belirler; Expo/Flutter'da iOS, Android ve web'den istenenler.
export const TASK_TARGETS = ["ios", "android", "web"] as const;
export type TaskTarget = (typeof TASK_TARGETS)[number];

export function resolveTargets(platform: (typeof TASK_PLATFORMS)[number], targets: readonly TaskTarget[] | undefined) {
  if (platform === "ios_swift") return ["ios"] as TaskTarget[];
  if (platform === "android_kotlin") return ["android"] as TaskTarget[];
  if (platform === "web") return ["web"] as TaskTarget[];
  const chosen: readonly TaskTarget[] = targets && targets.length > 0 ? targets : ["ios", "android"];
  return TASK_TARGETS.filter((t) => chosen.includes(t));
}

// Tasarım alanlarının bu turdan önceki görevlerde olmayanları varsayılanla doldurulur.
export function resolveDesign(design: {
  theme: (typeof TASK_THEMES)[number];
  style: (typeof TASK_STYLES)[number];
  gamification?: (typeof TASK_GAMIFICATIONS)[number];
  density?: (typeof TASK_DENSITIES)[number];
  references?: string;
}) {
  const references = design.references?.trim();
  return {
    theme: design.theme,
    style: design.style,
    gamification: design.gamification ?? "none",
    density: design.density ?? "balanced",
    ...(references ? { references } : {}),
  };
}

export const taskParamsSchema = z
  .object({
    platform: z.enum(TASK_PLATFORMS),
    // Eski görevlerde yok; gönderilmezse platformdan türetilir (bkz. resolveTargets).
    targets: z.array(z.enum(TASK_TARGETS)).max(3).optional(),
    backend: z.enum(TASK_BACKENDS),
    auth: z.enum(TASK_AUTHS),
    // Fikrin core_features'ından seçilenler + kullanıcının serbest eklemeleri
    // (3-5 önerilir, form bunu uyarı olarak gösterir; sınır daha geniş).
    mvp_features: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    design: z.object({
      theme: z.enum(TASK_THEMES),
      style: z.enum(TASK_STYLES),
      gamification: z.enum(TASK_GAMIFICATIONS).optional(),
      density: z.enum(TASK_DENSITIES).optional(),
      references: z.string().max(300).optional(),
    }),
    notes: z.string().max(4000).optional(),
  })
  .transform((params) => ({
    ...params,
    targets: resolveTargets(params.platform, params.targets),
    design: resolveDesign(params.design),
  }));

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

// İskelet üretimini başlatmaya (ready) ya da tekrar denemeye (failed) izin
// verilen durumlar. Tekrar deneme aynı repo/issue ve aynı belgelerle çalışır.
export const TASK_BUILDABLE_STATUSES: readonly TaskStatus[] = ["ready", "failed"];

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

// Faz 3B: kullanıcının arayüzde belge düzenlemesi (yalnızca görev 'ready' iken).
export const taskDocumentPatchSchema = z.object({
  content: documentContent,
});

// Faz 3C: build-skeleton.yml'ın ilerleme/sonuç bildirimi. repo_url/issue_url
// repo ve issue açılır açılmaz gönderilir (iş sonra patlasa da tekrar deneme
// aynı repoyu kullansın); status 'done' yalnızca başarı yolunda gelir —
// başarısızlığı workflow_runs bitişi işler.
export const taskBuildReportSchema = z
  .object({
    idea_id: z.string().min(1),
    repo_url: z.url().optional(),
    issue_url: z.url().optional(),
    status: z.literal("done").optional(),
  })
  .refine((d) => d.repo_url || d.issue_url || d.status, "En az bir alan gönderilmeli");

// Havuz bakımı (merge-ideas.yml, prompts/merge-ideas.md). scripts/lib/idea-schema.ts
// proposalsOutputSchema ile aynı olmalı. Birleşik fikir günlük fikir şemasını
// kullanır; yalnızca ilham kaynakları boş olabilir (elle girilmiş kaynaklar).
export const mergedIdeaSchema = ideaInputSchema.extend({
  inspiration_sources: z.array(z.string().min(1)),
});

export const MAX_MERGES_PER_RUN = 6;
export const MAX_FEATURES_PER_RUN = 6;

export const proposalsSubmitSchema = z.object({
  run_id: z.string().min(1).optional(),
  merges: z
    .array(
      z.object({
        source_ids: z.array(z.string().min(1)).min(2).max(4),
        reason: z.string().min(1),
        idea: mergedIdeaSchema,
      }),
    )
    .max(MAX_MERGES_PER_RUN),
  features: z
    .array(
      z.object({
        source_id: z.string().min(1),
        target_idea_id: z.string().min(1),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(2000),
        reason: z.string().min(1),
      }),
    )
    .max(MAX_FEATURES_PER_RUN),
});

export type ProposalsSubmit = z.infer<typeof proposalsSubmitSchema>;

// Gözden düşen fikirler (2026-10-03): bakım puanı bu sınırın altında art arda
// ARCHIVE_AFTER_RUNS bakım koşusu kalan 'new' fikir arşivlenir.
export const ARCHIVE_SCORE_THRESHOLD = 7;
export const ARCHIVE_AFTER_RUNS = 3;

// Bakım puanı: kullanıcı puanı varsa web'deki combinedScore() ile aynı
// (%40 Claude + %60 kullanıcı), yoksa Claude'un genel puanı.
export function maintenanceScore(overall: number, userRating: number | null): number {
  return userRating == null ? overall : overall * 0.4 + userRating * 0.6;
}

// Grup 3: repo henüz yokken kabul edilen özellik önerisinin issue'su iskelet
// kurulurken açılır (prepare-skeleton-repo.ts) ve adresi buraya yazılır.
export const proposalIssueSchema = z.object({ issue_url: z.url() });

export const maintenanceFinalizeSchema = z.object({ run_id: z.string().min(1).optional() });
export type MergedIdea = z.infer<typeof mergedIdeaSchema>;
