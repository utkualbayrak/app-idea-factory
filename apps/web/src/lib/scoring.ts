// %40 Claude genel puanı + %60 kullanıcı puanı (notes.txt madde 16).
// Claude puanı yoksa (elle girilmiş, değerlendirilmemiş fikir) birleşik puan da yok.
export function combinedScore(claudeOverall: number | null, userRating: number | null): number | null {
  if (claudeOverall == null || userRating == null) return null;
  return claudeOverall * 0.4 + userRating * 0.6;
}

// Havuz bakımının arşiv kuralı (apps/api/src/schema.ts ile aynı): bakım puanı
// 7.00'ın altında art arda 3 bakım koşusu kalan 'new' fikir arşivlenir.
export const ARCHIVE_SCORE_THRESHOLD = 7;
export const ARCHIVE_AFTER_RUNS = 3;

// Bakım puanı: kullanıcı puanı varsa birleşik puan, yoksa Claude'un genel puanı.
export function maintenanceScore(claudeOverall: number | null, userRating: number | null): number | null {
  if (claudeOverall == null) return null;
  return combinedScore(claudeOverall, userRating) ?? claudeOverall;
}
