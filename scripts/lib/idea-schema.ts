import { z } from "zod";

// apps/api/src/schema.ts'deki ideaInputSchema ile aynı olmalı — orası API'nin
// kendi doğrulaması, bu da workflow'un Claude çıktısını göndermeden önce
// erken ve net bir hatayla doğrulaması için (docs/PROJE.md Akış 1, adım 5).
// Paketler arası paylaşım yok (ayrı pnpm workspace'leri); bu iki dosyayı
// birlikte güncelle.
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

export const ideasArraySchema = z.array(ideaInputSchema).length(10);

export type IdeaInput = z.infer<typeof ideaInputSchema>;
