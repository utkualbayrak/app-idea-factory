import type { DocumentKind, TaskAuth, TaskBackend, TaskPlatform, TaskStatus, TaskStyle, TaskTheme } from "@/lib/api";

// Görev formu ve geliştirme kartındaki Türkçe etiketler (docs/PROJE.md
// "Görev formu alanları").

export const PLATFORM_LABELS: Record<TaskPlatform, string> = {
  expo: "Çapraz platform — React Native / Expo",
  flutter: "Çapraz platform — Flutter",
  ios_swift: "iOS — Swift",
  android_kotlin: "Android — Kotlin",
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
  minimal: "Minimal",
  colorful: "Renkli",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  planning: "Belgeler hazırlanıyor",
  planning_failed: "Belge üretimi başarısız",
  ready: "Belgeler hazır — onayını bekliyor",
  queued: "İskelet sırada",
  running: "İskelet kuruluyor",
  done: "İskelet hazır",
  failed: "İskelet üretimi başarısız",
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
