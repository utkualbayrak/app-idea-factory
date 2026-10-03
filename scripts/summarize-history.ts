import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RecentIdea } from "./lib/api-client";

// recent-names.json (son 90 gün, ~900 satır) → prompts/daily-ideas.md'nin
// okuduğu kısa geçmiş özeti: doygun kategoriler, sık etiketler, son 30 günün
// fikirleri ve daha önce ilham olarak kullanılmış URL'ler. Mekanizma/tema
// kümelemesini prompt yapar; bu script yalnızca sayar ve listeler.
//
// Kullanım: tsx summarize-history.ts <recent-names.json> <history-summary.json>

const SHORT_DAYS = 14;
const LONG_DAYS = 30;
const SATURATION_THRESHOLD = 3;
const TOP_TAGS = 20;

// Türkiye günü (cron 06:00 TR'de çalışır; batch_date de TR günüdür).
function todayIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function countBy(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

async function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error("Kullanim: tsx summarize-history.ts <recent-names.json> <history-summary.json>");
    process.exit(1);
  }

  const { ideas = [] } = JSON.parse(await readFile(inPath, "utf-8")) as { ideas?: RecentIdea[] };
  const today = todayIstanbul();
  // batch_date yoksa (eski API) fikir "bugün" sayılır: pencerelerin içinde kalır.
  const dated = ideas.map((idea) => ({ ...idea, batch_date: idea.batch_date ?? today }));
  // Birleştirilen kaynaklar, birleşik fikirle zaten temsil ediliyor: sayımlara
  // girerse aynı konsept iki kez sayılır. URL kullanımında yine de kalırlar.
  const counted = dated.filter((idea) => idea.status !== "merged");
  const shortStart = daysBefore(today, SHORT_DAYS);
  const longStart = daysBefore(today, LONG_DAYS);
  const inShort = counted.filter((i) => i.batch_date >= shortStart);
  const inLong = counted.filter((i) => i.batch_date >= longStart);

  const categories14 = countBy(inShort.map((i) => i.category.toLowerCase()));
  const categories30 = countBy(inLong.map((i) => i.category.toLowerCase()));
  const tags30 = countBy(inLong.flatMap((i) => (i.tags ?? []).map((t) => t.toLowerCase()))).slice(0, TOP_TAGS);

  // Tüm 90 gün: aynı haftalık sinyal günlerce geri gelebiliyor.
  const urlUses = new Map<string, { names: string[]; last_used: string }>();
  for (const idea of dated) {
    for (const url of idea.inspiration_sources ?? []) {
      const entry = urlUses.get(url) ?? { names: [], last_used: idea.batch_date };
      if (!entry.names.includes(idea.name)) entry.names.push(idea.name);
      if (idea.batch_date > entry.last_used) entry.last_used = idea.batch_date;
      urlUses.set(url, entry);
    }
  }

  const summary = {
    generated_for: today,
    windows: { short_days: SHORT_DAYS, long_days: LONG_DAYS, saturation_threshold: SATURATION_THRESHOLD },
    total_ideas_90d: counted.length,
    category_counts_14d: categories14.map(({ value, count }) => ({ category: value, count })),
    saturated_categories_14d: categories14.filter((c) => c.count >= SATURATION_THRESHOLD).map((c) => c.value),
    category_counts_30d: categories30.map(({ value, count }) => ({ category: value, count })),
    top_tags_30d: tags30.map(({ value, count }) => ({ tag: value, count })),
    recent_ideas_30d: inLong.map((i) => ({
      batch_date: i.batch_date,
      name: i.name,
      category: i.category,
      one_liner: i.one_liner,
      tags: i.tags ?? [],
    })),
    used_inspiration_urls: [...urlUses.entries()]
      .map(([url, { names, last_used }]) => ({ url, used_by: names, last_used }))
      .sort((a, b) => b.last_used.localeCompare(a.last_used)),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(
    `Yazildi: ${outPath} (${inLong.length} fikir/30 gun, doygun kategori: ${summary.saturated_categories_14d.join(", ") || "yok"}, ${urlUses.size} kullanilmis URL)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
