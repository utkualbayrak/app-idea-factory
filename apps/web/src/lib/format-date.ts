// Uygulama genelinde tek tarih formatı: Türkiye usulü gün.ay.yıl (01.10.2026).
// API zamanları Z'li UTC ISO olarak döner (bkz. apps/api/src/db.ts toUtcIso);
// gösterim her zaman Türkiye saatiyle yapılır, tarayıcının saat diliminden bağımsız.

const TIME_ZONE = "Europe/Istanbul";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/** ISO zaman damgası → "01.10.2026" */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** ISO zaman damgası → "01.10.2026 06:12" */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`;
}

/**
 * Takvim tarihi ("2026-10-01", batch_date gibi) → "01.10.2026".
 * Saat dilimine sokulmadan string olarak çevrilir; aksi halde gece yarısı
 * UTC'si bazı saat dilimlerinde bir önceki güne kayabilir.
 */
export function formatBatchDate(value: string): string {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}.${m}.${y}` : value;
}

/** İki ISO zaman damgası arasındaki süre → "45 sn", "20 dk", "1 sa 5 dk" */
export function formatDuration(startIso: string, endIso: string): string {
  const seconds = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

// Bugünün tarihi (Türkiye saatiyle) "YYYY-MM-DD" olarak.
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

// "YYYY-MM-DD" tarihine gün ekler (saat dilimi kaymasız, UTC üzerinden).
export function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// İki "YYYY-MM-DD" arasındaki gün farkı.
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// "az önce", "12 dk önce", "3 saat önce", "5 gün önce"; 30 günden eskiyse tarih.
export function formatRelative(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days} gün önce`;
  return formatDate(iso);
}

// Arşivlenmiş fikrin kalıcı silineceği gün: arşivlenme + Ayarlar'daki süre.
export function formatPurgeDate(archivedAt: string, purgeDays: number): string {
  return formatDate(new Date(new Date(archivedAt).getTime() + purgeDays * 86_400_000).toISOString());
}
