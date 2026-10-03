import type {
  FindingKind,
  FindingPlatform,
  FindingSeverity,
  ScenarioResult,
  TaskParams,
  TestChannel,
  TestPlatform,
  TestRound,
} from "@/lib/api";

export const TEST_PLATFORM_LABELS: Record<TestPlatform, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

export const TEST_PLATFORMS = Object.keys(TEST_PLATFORM_LABELS) as TestPlatform[];

export const TEST_CHANNEL_LABELS: Record<TestChannel, string> = {
  testflight: "TestFlight",
  play_internal: "Google Play dahili test",
  expo_go: "Expo Go",
  direct_install: "Doğrudan kurulum (APK / cihaz)",
  web_url: "Web adresi / önizleme",
  other: "Diğer",
};

export const SCENARIO_RESULT_LABELS: Record<ScenarioResult, string> = {
  passed: "Geçti",
  partial: "Kısmen",
  failed: "Kaldı",
  skipped: "Denenmedi",
};

export const SCENARIO_RESULT_STYLES: Record<ScenarioResult, string> = {
  passed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  skipped: "bg-muted text-muted-foreground",
};

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: "Kritik",
  major: "Orta",
  minor: "Düşük",
};

export const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  major: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  minor: "bg-muted text-muted-foreground",
};

export const FINDING_KIND_LABELS: Record<FindingKind, string> = {
  bug: "Hata",
  ux: "Kullanılabilirlik",
  feature_request: "Özellik isteği",
  performance: "Performans",
  other: "Diğer",
};

export const FINDING_PLATFORM_LABELS: Record<FindingPlatform, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
  both: "Tümü",
};

export const ROUND_STATUS_LABELS: Record<TestRound["status"], string> = {
  running: "Sürüyor",
  approved: "Onaylandı",
  rework: "Geri gönderildi",
  cancelled: "İptal edildi",
};

export const ROUND_STATUS_STYLES: Record<TestRound["status"], string> = {
  running: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rework: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  cancelled: "bg-muted text-muted-foreground",
};

// Görevin hedef cihazlarından ve teknoloji seçiminden varsayılan test
// platformları ve kanalı.
export function defaultTestPlatforms(params: TaskParams | undefined): TestPlatform[] {
  return params?.targets.length ? [...params.targets] : ["ios", "android"];
}

export function defaultTestChannel(params: TaskParams | undefined): TestChannel {
  const targets = defaultTestPlatforms(params);
  if (targets.length === 1 && targets[0] === "web") return "web_url";
  if (params?.platform === "expo") return "expo_go";
  if (targets.length === 1) return targets[0] === "ios" ? "testflight" : "play_internal";
  return "direct_install";
}

export const SUCCESS_CRITERIA_SUGGESTIONS = [
  "Test boyunca çökme yaşanmaz",
  "Temel akış yardım almadan tamamlanır",
  "Ortalama memnuniyet 7 ve üzeri",
  "Kritik bulgu kalmaz",
];
