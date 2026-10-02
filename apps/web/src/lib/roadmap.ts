import type { RoadmapItem } from "@/lib/api";

// roadmap.md'den (prompts/plan-idea.md formatı: "Aşama N — …" başlıkları
// altında "- [ ] görev" satırları) görev listesi çıkarır. Repoda işaretlenmiş
// ("- [x]") görevler tamamlanmış gelir. Başlık seviyesi önemsiz; her görev
// kendinden önceki son başlığın aşamasına yazılır.
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const TASK = /^\s*[-*+]\s+\[( |x|X)\]\s+(.+?)\s*$/;

export function parseRoadmap(markdown: string): RoadmapItem[] {
  const items: RoadmapItem[] = [];
  let phase: string | null = null;
  for (const line of markdown.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      phase = heading[1].replace(/\*\*/g, "").trim();
      continue;
    }
    const task = TASK.exec(line);
    if (task) items.push({ phase, text: task[2].slice(0, 500), done: task[1] !== " " });
  }
  return items;
}

// Görevleri aşamalarına göre gruplar (sıra korunur).
export function groupByPhase<T extends { phase: string | null }>(items: T[]): { phase: string | null; items: T[] }[] {
  const groups: { phase: string | null; items: T[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.phase === item.phase) last.items.push(item);
    else groups.push({ phase: item.phase, items: [item] });
  }
  return groups;
}
