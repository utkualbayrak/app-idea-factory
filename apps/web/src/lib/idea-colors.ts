import type { IdeaStatus, TaskStatus } from "@/lib/api";

// Kategori isimlerine deterministik (hash tabanlı) renk ataması — aynı
// kategori her zaman aynı rengi alır, yeni kategoriler eklendikçe elle
// güncelleme gerekmez.
const CATEGORY_PALETTE = [
  "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function categoryColorClasses(category: string): string {
  return CATEGORY_PALETTE[hashString(category) % CATEGORY_PALETTE.length];
}

// Durumlar sabit ve az sayıda — hash yerine sabit palet.
const STATUS_PALETTE: Record<IdeaStatus, string> = {
  new: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  deleted: "bg-muted text-muted-foreground",
  awaiting_development: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  in_development: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  rework: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  awaiting_test: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  testing: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  merged: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

// Tüm ekranlarda ortak durum etiketleri.
export const STATUS_LABELS: Record<IdeaStatus, string> = {
  new: "Yeni",
  on_hold: "Askıda",
  deleted: "Silinmiş",
  awaiting_development: "Geliştirme bekliyor",
  in_development: "Geliştiriliyor",
  rework: "Revizyonda",
  awaiting_test: "Test bekliyor",
  testing: "Test ediliyor",
  approved: "Dağıtıma hazır",
  merged: "Birleştirildi",
  archived: "Arşivlendi",
};

// "Geliştir" denmiş fikirler: ana listeden çıkar, Geliştirilenler ekranında
// görünür. Testten geri gönderilenler (rework) de buraya döner.
export const DEVELOPMENT_STATUSES: IdeaStatus[] = ["awaiting_development", "in_development", "rework"];
// "Geliştirildi" denmiş, test sürecindeki fikirler: Test ekranı.
export const TEST_STATUSES: IdeaStatus[] = ["awaiting_test", "testing"];
// Durum rozetinde son commit tarihi gösterilen durumlar (iskelet üzerinde çalışılıyor).
export const COMMIT_DATE_STATUSES: IdeaStatus[] = ["in_development", "rework"];
// Testi onaylanmış fikirler: Dağıtıma hazır ekranı.
export const READY_STATUSES: IdeaStatus[] = ["approved"];

// Fikrin hangi liste ekranında durduğu — detaydaki geri linki ve ana listeden
// dışlama buna göre. Ana Fikirler listesi yalnızca new/on_hold'u gösterir.
export type IdeaSection = { path: string; label: string };

const IDEA_SECTIONS: { statuses: IdeaStatus[]; section: IdeaSection }[] = [
  { statuses: DEVELOPMENT_STATUSES, section: { path: "/developed", label: "Geliştirilenler" } },
  { statuses: TEST_STATUSES, section: { path: "/testing", label: "Test" } },
  { statuses: READY_STATUSES, section: { path: "/ready", label: "Dağıtıma hazır" } },
];

export function ideaSection(status: IdeaStatus): IdeaSection {
  if (status === "archived") return { path: "/ideas/archive", label: "Arşiv" };
  return IDEA_SECTIONS.find((s) => s.statuses.includes(status))?.section ?? { path: "/ideas", label: "Fikirler" };
}

// Birleştirilmiş/arşivlenmiş/silinmiş fikirler API listesinde zaten yok;
// yine de havuz yalnızca new/on_hold.
export function isInIdeaPool(status: IdeaStatus): boolean {
  return status === "new" || status === "on_hold";
}

// Ad yalnızca "Geliştirme bekliyor"da değiştirilebilir (iskelet repo'su bu
// addan türetilir); belgeler üretilirken beklenir.
export function canRenameIdea(status: IdeaStatus, taskStatus: TaskStatus | undefined): boolean {
  return status === "awaiting_development" && taskStatus !== "planning";
}

export function statusColorClasses(status: IdeaStatus): string {
  return STATUS_PALETTE[status];
}
