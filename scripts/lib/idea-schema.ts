import { z } from "zod";

// apps/api/src/schema.ts'deki ideaInputSchema ile aynı olmalı — orası API'nin
// kendi doğrulaması, bu da workflow'un Claude çıktısını göndermeden önce
// erken ve net bir hatayla doğrulaması için (docs/PROJE.md Akış 1, adım 5).
// Paketler arası paylaşım yok (ayrı pnpm workspace'leri); bu iki dosyayı
// birlikte güncelle.
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

export const ideasArraySchema = z.array(ideaInputSchema).length(10);

export type IdeaInput = z.infer<typeof ideaInputSchema>;

// Grup 4: notlarla yeniden değerlendirme (apps/api/src/schema.ts'deki
// reevaluationSchema ile aynı olmalı).
export const reevaluationSchema = z.object({
  scores: ideaScoresSchema,
  tags: z.array(z.string().min(1)).min(1).optional(),
  change_summary: z.string().min(1),
});

export type Reevaluation = z.infer<typeof reevaluationSchema>;

// Faz 3 sonrası tur, Grup 5: evaluate-idea.yml çıktısı (prompts/evaluate-idea.md).
// apps/api/src/schema.ts'deki evaluationSchema ile aynı olmalı; status alanı
// yalnızca burada (betik "ok" değilse hiçbir şey göndermez).
export const evaluationOutputSchema = z.object({
  status: z.enum(["ok", "input_error"]),
  error: z.string().optional(),
  scores: ideaScoresSchema.optional(),
  tags: z.array(z.string().min(1)).min(1).max(4).optional(),
  category: z.string().min(1).optional(),
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

export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

// Grup 4: rakip/benzer uygulama bulma (apps/api/src/schema.ts'deki
// competitorSchema ile aynı olmalı).
export const COMPETITOR_SIMILARITIES = ["direct", "partial", "alternative"] as const;

export const competitorSchema = z.object({
  app_name: z.string().min(1),
  url: z.url(),
  similarity: z.enum(COMPETITOR_SIMILARITIES),
  note: z.string().min(1),
});

// prompts/find-competitors.md'nin çıktısı: dizi değil, status'lu nesne.
// status 'ok' değilse competitors her zaman boş (arama/girdi hatası —
// "rakip yok" ile karıştırılmamalı).
export const competitorsOutputSchema = z.object({
  status: z.enum(["ok", "search_failed", "input_error"]),
  competitors: z.array(competitorSchema).max(5),
});

export type Competitor = z.infer<typeof competitorSchema>;
