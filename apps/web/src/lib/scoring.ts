// %40 Claude genel puanı + %60 kullanıcı puanı (notes.txt madde 16).
// Claude puanı yoksa (elle girilmiş, değerlendirilmemiş fikir) birleşik puan da yok.
export function combinedScore(claudeOverall: number | null, userRating: number | null): number | null {
  if (claudeOverall == null || userRating == null) return null;
  return claudeOverall * 0.4 + userRating * 0.6;
}
