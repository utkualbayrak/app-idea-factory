import type { Idea } from "@/lib/api";

// notes.txt madde 1 (basit kısım): fikri okunabilir Markdown olarak panoya
// kopyalamak için — başka bir AI'a yapıştırıp "notlarımdan hareketle
// yeniden değerlendir" diyebilmek amacıyla.
export function ideaToMarkdown(idea: Idea): string {
  const lines: string[] = [
    `# ${idea.name}`,
    "",
    idea.one_liner,
    "",
    `**Kategori:** ${idea.category} · **Durum:** ${idea.status}`,
    "",
    "## Problem",
    idea.problem,
    "",
    "## Hedef kitle",
    idea.target_audience,
    "",
    "## Temel özellikler",
    ...idea.core_features.map((f) => `- ${f}`),
    "",
    "## Gelir modeli",
    idea.monetization,
    "",
    "## İlham kaynakları",
    ...idea.inspiration_sources.map((s) => `- ${s}`),
    "",
  ];

  if (idea.tags.length > 0) {
    lines.push(`**Etiketler:** ${idea.tags.join(", ")}`, "");
  }

  const { scores } = idea;
  if (scores) {
    lines.push(
      "## Claude puan dökümü",
      `- Pazar: ${scores.market.toFixed(2)}/10 — ${scores.market_reason}`,
      `- Uygulanabilirlik (solo): ${scores.feasibility_solo_dev.toFixed(2)}/10 — ${scores.feasibility_solo_dev_reason}`,
      `- Özgünlük: ${scores.originality.toFixed(2)}/10 — ${scores.originality_reason}`,
      `- Genel: ${scores.overall.toFixed(2)}/10 — ${scores.overall_reason}`,
      "",
    );
  } else {
    lines.push("## Claude puan dökümü", "Henüz puanlanmadı.", "");
  }

  if (idea.user_rating != null) {
    lines.push(`**Kullanıcı puanı:** ${idea.user_rating.toFixed(2)}/10`, "");
  }

  if (idea.user_note) {
    lines.push("## Kullanıcı notu", idea.user_note, "");
  }

  return lines.join("\n");
}
