import { z } from "zod";

// apps/api/src/schema.ts'deki taskParamsSchema / taskDocumentsSubmitSchema ile
// aynı olmalı — paketler arası paylaşım yok, ikisini birlikte güncelle.
export const taskParamsSchema = z.object({
  platform: z.enum(["ios_swift", "android_kotlin", "expo", "flutter", "web"]),
  // Grup 6'dan önceki görevlerde yok.
  targets: z.array(z.enum(["ios", "android", "web"])).min(1).max(3).optional(),
  backend: z.enum(["none", "supabase", "firebase", "custom_api"]),
  auth: z.enum(["none", "email", "social"]),
  mvp_features: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  design: z.object({
    theme: z.enum(["light", "dark", "both"]),
    style: z.enum(["native", "minimal", "soft", "colorful", "editorial", "professional", "playful"]),
    // API okurken varsayılanla doldurur; eski görevlerde de dolu gelir.
    gamification: z.enum(["none", "light", "full"]).optional(),
    density: z.enum(["airy", "balanced", "compact"]).optional(),
    references: z.string().max(300).optional(),
  }),
  notes: z.string().max(4000).optional(),
});

export type TaskParams = z.infer<typeof taskParamsSchema>;

// prompts/plan-idea.md'nin yazdığı dosyalar (scripts/output/docs/ altında) →
// API'deki belge türü.
export const PLAN_DOCUMENT_FILES = {
  prd: "prd.md",
  screens: "screens.md",
  tech_plan: "tech-plan.md",
  roadmap: "roadmap.md",
} as const;

export type PlanDocumentKind = keyof typeof PLAN_DOCUMENT_FILES;

// prompts/build-skeleton.md'nin yazdığı rapor (scripts/output/skeleton-report.json).
const checkResult = z.enum(["passed", "failed", "skipped"]);

export const skeletonReportSchema = z.object({
  status: z.enum(["ok", "failed"]),
  summary: z.string().min(1),
  checks: z.object({
    install: checkResult,
    typecheck: checkResult,
    lint: checkResult,
    // prompts/build-skeleton.md'nin sonraki sürümüyle geldi; eski raporlarda yok.
    test: checkResult.optional(),
  }),
  // Boş string olabilir ("not yok").
  notes: z.string().optional(),
});

export type SkeletonReport = z.infer<typeof skeletonReportSchema>;
