import type { ActivityKind, Idea } from "@/lib/api";

// Fikir aktivite rozeti için saf yardımcılar (components/ActivityBadge.tsx
// ve detay sayfası kullanır).

const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_AFTER_MS = 7 * DAY_MS;
export const STUCK_AFTER_MS = 60 * 60 * 1000;

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note_updated: "Not güncellendi",
  rating_updated: "Puan verildi",
  status_changed: "Durum değişti",
  reevaluate_queued: "Değerlendiriliyor…",
  reevaluated: "Yeniden değerlendirildi",
  reevaluate_failed: "Değerlendirme başarısız",
  competitors_queued: "Rakip aranıyor…",
  competitors_found: "Rakipler bulundu",
  competitors_failed: "Rakip arama başarısız",
};

export const IN_PROGRESS_KINDS: ActivityKind[] = ["reevaluate_queued", "competitors_queued"];
export const SUCCESS_KINDS: ActivityKind[] = ["reevaluated", "competitors_found"];
export const FAILED_KINDS: ActivityKind[] = ["reevaluate_failed", "competitors_failed"];

export type ActivityIdea = Pick<Idea, "last_activity_at" | "last_activity_kind" | "activity_seen_at">;

// Okunmamış = arka plan işinin sonucu (başarılı/başarısız) geldi, kullanıcı
// o andan beri detay sayfasını açmadı, ve 7 günden eski değil. Kullanıcının
// kendi yaptığı not/puan/durum değişiklikleri ve devam eden işler okunmamış sayılmaz.
export function isActivityUnread(idea: ActivityIdea, now = Date.now()): boolean {
  const { last_activity_at: at, last_activity_kind: kind, activity_seen_at: seen } = idea;
  if (!at || !kind || !(SUCCESS_KINDS.includes(kind) || FAILED_KINDS.includes(kind))) return false;
  if (now - new Date(at).getTime() > STALE_AFTER_MS) return false;
  return !seen || new Date(seen).getTime() < new Date(at).getTime();
}
