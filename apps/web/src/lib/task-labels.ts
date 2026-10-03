import type {
  DocumentKind,
  TaskAuth,
  TaskBackend,
  TaskDensity,
  TaskGamification,
  TaskPlatform,
  TaskStatus,
  TaskStyle,
  TaskTarget,
  TaskParams,
  TaskTheme,
} from "@/lib/api";

// Görev formu ve geliştirme kartındaki Türkçe etiketler (docs/PROJE.md
// "Görev formu alanları").

export const TARGET_LABELS: Record<TaskTarget, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

// Native seçenekler ve web tek bir hedefe kilitli; çapraz platformda seçilir.
export const FIXED_TARGETS: Partial<Record<TaskPlatform, TaskTarget[]>> = {
  ios_swift: ["ios"],
  android_kotlin: ["android"],
  web: ["web"],
};

export const PLATFORM_LABELS: Record<TaskPlatform, string> = {
  expo: "Çapraz platform — React Native / Expo",
  flutter: "Çapraz platform — Flutter",
  ios_swift: "iOS — Swift",
  android_kotlin: "Android — Kotlin",
  web: "Web — React + Vite (PWA)",
};

export const BACKEND_LABELS: Record<TaskBackend, string> = {
  none: "Yok (veri cihazda)",
  supabase: "Supabase",
  firebase: "Firebase",
  custom_api: "Özel API",
};

export const AUTH_LABELS: Record<TaskAuth, string> = {
  none: "Yok",
  email: "E-posta",
  social: "Sosyal giriş (Apple/Google)",
};

export const THEME_LABELS: Record<TaskTheme, string> = {
  light: "Açık",
  dark: "Koyu",
  both: "Açık + koyu (sisteme uyar)",
};

export const STYLE_LABELS: Record<TaskStyle, string> = {
  native: "Platforma özgü",
  minimal: "Minimal",
  soft: "Yumuşak / sıcak",
  colorful: "Canlı / renkli",
  editorial: "Editoryal / tipografik",
  professional: "Profesyonel / veri odaklı",
  playful: "Oyunsu",
};

export const STYLE_DESCRIPTIONS: Record<TaskStyle, string> = {
  native: "Sistem bileşenleri ve platformun kendi görünümü, özel tema en az.",
  minimal: "Sade, bol beyaz alan, tek vurgu rengi.",
  soft: "Yumuşak tonlar, yuvarlak köşeler, sakin ve samimi.",
  colorful: "Cesur renkler ve belirgin vurgular, enerjik.",
  editorial: "Tipografi ön planda, dergi/okuma deneyimi gibi.",
  professional: "Ciddi, yoğun bilgi, tablo/grafik dostu, iş aracı hissi.",
  playful: "Eğlenceli şekiller, illüstrasyon, hareket. Oyunlaştırma ayrı seçilir.",
};

export const GAMIFICATION_LABELS: Record<TaskGamification, string> = {
  none: "Yok",
  light: "Hafif (ilerleme, tamamlanma anı)",
  full: "Yoğun (seri, rozet, puan)",
};

export const DENSITY_LABELS: Record<TaskDensity, string> = {
  airy: "Ferah",
  balanced: "Dengeli",
  compact: "Sıkı",
};

// Kart ve dışa aktarmada tek satırlık tasarım özeti.
export function designSummary(design: TaskParams["design"]): string {
  return [
    THEME_LABELS[design.theme],
    STYLE_LABELS[design.style],
    `oyunlaştırma: ${GAMIFICATION_LABELS[design.gamification].split(" (")[0].toLowerCase()}`,
    `yoğunluk: ${DENSITY_LABELS[design.density].toLowerCase()}`,
  ].join(" · ");
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  planning: "Belgeler hazırlanıyor",
  planning_failed: "Belge üretimi başarısız",
  ready: "Belgeler hazır — onayını bekliyor",
  queued: "İskelet sırada",
  running: "İskelet kuruluyor",
  done: "İskelet hazır",
  failed: "İskelet üretimi başarısız",
};

// build-skeleton.yml onaylı belgeleri iskelet reposunda bu yollara yazar
// (scripts/lib/task-schema.ts PLAN_DOCUMENT_FILES). Repo senkronunda bu
// dosyalar ilgili belge sekmesine, docs/ altındaki diğerleri ek sekmelere düşer.
export const DOCUMENT_REPO_PATHS: Record<DocumentKind, string> = {
  prd: "docs/prd.md",
  screens: "docs/screens.md",
  tech_plan: "docs/tech-plan.md",
  roadmap: "docs/roadmap.md",
};

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  prd: "Ürün belgesi",
  screens: "Ekranlar ve akışlar",
  tech_plan: "Teknik plan",
  roadmap: "Yol haritası",
};

// Formu tekrar gönderip belgeleri yeniden üretmeye izin verilen durumlar
// (apps/api/src/schema.ts TASK_REPLANNABLE_STATUSES ile aynı).
export const REPLANNABLE_STATUSES: TaskStatus[] = ["planning_failed", "ready"];

// Arka planda bir iş sürerken detay sayfası kendini yeniler.
export const TASK_IN_PROGRESS_STATUSES: TaskStatus[] = ["planning", "queued", "running"];
