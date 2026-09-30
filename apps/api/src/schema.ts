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
export const reevaluationSchema = z.object({
  scores: ideaScoresSchema,
  tags: z.array(z.string().min(1)).min(1).optional(),
});

export type Reevaluation = z.infer<typeof reevaluationSchema>;

// Grup 4: rakip/benzer uygulama bulma.
export const competitorSchema = z.object({
  app_name: z.string().min(1),
  url: z.string().min(1).nullable().optional(),
  note: z.string().min(1).nullable().optional(),
});

export const competitorsSubmitSchema = z.object({
  idea_id: z.string().min(1),
  competitors: z.array(competitorSchema).max(10),
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
