// %40 Claude genel puanı + %60 kullanıcı puanı (notes.txt madde 16).
export function combinedScore(claudeOverall: number, userRating: number | null): number | null {
  if (userRating == null) return null;
  return claudeOverall * 0.4 + userRating * 0.6;
}
