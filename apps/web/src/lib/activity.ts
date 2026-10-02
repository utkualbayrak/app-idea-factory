import type { ActivityKind, CronRun, Idea, IdeaWorkflow, WorkflowRun } from "@/lib/api";

// Fikir aktivite rozeti için saf yardımcılar (components/ActivityBadge.tsx
// ve detay sayfası kullanır).

const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_AFTER_MS = 7 * DAY_MS;
export const STUCK_AFTER_MS = 60 * 60 * 1000;

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note_updated: "Not güncellendi",
  rating_updated: "Puan verildi",
  status_changed: "Durum değişti",
  renamed: "Adı değişti",
  reevaluate_queued: "Değerlendiriliyor…",
  reevaluated: "Yeniden değerlendirildi",
  reevaluate_failed: "Değerlendirme başarısız",
  competitors_queued: "Rakip aranıyor…",
  competitors_found: "Rakipler bulundu",
  competitors_failed: "Rakip arama başarısız",
  plan_queued: "Belgeler hazırlanıyor…",
  planned: "Belgeler hazır",
  plan_failed: "Belge üretimi başarısız",
  evaluate_queued: "Claude değerlendiriyor…",
  evaluated: "Değerlendirildi",
  evaluate_failed: "Değerlendirme başarısız",
  skeleton_queued: "İskelet kuruluyor…",
  skeleton_built: "İskelet hazır",
  skeleton_failed: "İskelet üretimi başarısız",
};

// Çalışma geçmişi ve gösterge panelindeki iş türü etiketleri.
export const WORKFLOW_LABELS: Record<IdeaWorkflow, string> = {
  "reevaluate-idea.yml": "Yeniden değerlendirme",
  "find-competitors.yml": "Rakip bulma",
  "plan-idea.yml": "Planlama belgeleri",
  "build-skeleton.yml": "İskelet üretimi",
  "evaluate-idea.yml": "Değerlendirme (elle girilen)",
};

export const IN_PROGRESS_KINDS: ActivityKind[] = [
  "reevaluate_queued",
  "competitors_queued",
  "plan_queued",
  "skeleton_queued",
  "evaluate_queued",
];
export const SUCCESS_KINDS: ActivityKind[] = ["reevaluated", "competitors_found", "planned", "skeleton_built", "evaluated"];
export const FAILED_KINDS: ActivityKind[] = [
  "reevaluate_failed",
  "competitors_failed",
  "plan_failed",
  "skeleton_failed",
  "evaluate_failed",
];

export type ActivityIdea = Pick<Idea, "last_activity_at" | "last_activity_kind" | "activity_seen_at"> &
  Partial<Pick<Idea, "last_activity_by">>;

// Okunmamış = arka plan işinin sonucu (başarılı/başarısız) geldi, kullanıcı
// o andan beri detay sayfasını açmadı, ve 7 günden eski değil. Kullanıcının
// kendi yaptığı not/puan/durum değişiklikleri ve devam eden işler okunmamış sayılmaz.
export function isActivityUnread(idea: ActivityIdea, now = Date.now()): boolean {
  const { last_activity_at: at, last_activity_kind: kind, activity_seen_at: seen } = idea;
  if (!at || !kind || !(SUCCESS_KINDS.includes(kind) || FAILED_KINDS.includes(kind))) return false;
  if (now - new Date(at).getTime() > STALE_AFTER_MS) return false;
  return !seen || new Date(seen).getTime() < new Date(at).getTime();
}

// Fikir işi hâlâ sırada/çalışıyor mu (1 saatten eskisi takılmış sayılır;
// API de o süreden sonra yeniden tetiklemeye izin verir).
export function isRunActive(run: Pick<WorkflowRun, "status" | "created_at"> | undefined, now = Date.now()): boolean {
  if (!run || (run.status !== "queued" && run.status !== "running")) return false;
  return now - new Date(run.created_at).getTime() < STUCK_AFTER_MS;
}

// Günlük üretim / havuz bakımı: 45 dakikadan eski 'running' kayıt takılmış
// sayılır (apps/api CRON_RUN_STALE_MS ile aynı).
export const CRON_RUN_STALE_MS = 45 * 60 * 1000;

export function isCronRunActive(run: Pick<CronRun, "status" | "started_at"> | undefined, now = Date.now()): boolean {
  return run?.status === "running" && now - new Date(run.started_at).getTime() < CRON_RUN_STALE_MS;
}
