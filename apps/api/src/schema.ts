import { z } from "zod";

// docs/PROJE.md "Fikir şeması" bölümüne karşılık gelir.
// Not: `scores` alanlarının ölçeği PROJE.md'de netleştirilmemiş; 1-10 tamsayı
// olarak varsayıldı (bkz. CLAUDE.md).
export const ideaScoresSchema = z.object({
  market: z.number().int().min(1).max(10),
  feasibility_solo_dev: z.number().int().min(1).max(10),
  originality: z.number().int().min(1).max(10),
  overall: z.number().int().min(1).max(10),
});

export const ideaInputSchema = z.object({
  name: z.string().min(1),
  one_liner: z.string().min(1),
  problem: z.string().min(1),
  target_audience: z.string().min(1),
  core_features: z.array(z.string().min(1)).min(1),
  monetization: z.string().min(1),
  category: z.string().min(1),
  inspiration_source: z.string().min(1),
  scores: ideaScoresSchema,
});

export const ideaBatchRequestSchema = z.object({
  batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD olmalı"),
  ideas: z.array(ideaInputSchema).min(1),
});

export const ideaPatchSchema = z
  .object({
    user_rating: z.number().int().min(1).max(5).nullable().optional(),
    user_note: z.string().nullable().optional(),
    status: z.enum(["new", "archived", "in_development", "developed"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "En az bir alan gönderilmeli");

export type IdeaInput = z.infer<typeof ideaInputSchema>;
export type IdeaBatchRequest = z.infer<typeof ideaBatchRequestSchema>;
export type IdeaPatch = z.infer<typeof ideaPatchSchema>;
