import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ideasArraySchema, type IdeaInput } from "./lib/idea-schema";
import type { TrendSummary } from "./lib/types";

// Kullanım: validate-ideas.ts <ideas.json> <recent-names.json> [trends.json]
//
// Hard fail (iş başarısız, fikirler gönderilmez): boş dizi (prompt trend
// verisi yetersizken bilerek [] yazıyor), şema hatası, isim tekrarı.
// Yalnızca uyarı (loglanır, gönderim devam eder): trends.json'da geçmeyen
// kaynak URL'leri, isim formatı, puan dağılımı — tek bir hatalı link yüzünden
// günün 10 fikrinin tamamı çöpe gitmesin diye.
//
// Hard fail'lerde sebep <ideas.json ile aynı klasör>/failure-reason.txt'e
// yazılır; finish-cron-run.ts onu cron geçmişine taşır.

let failureReasonPath = "";

async function fail(reason: string, details?: string): Promise<never> {
  console.error(details ? `${reason}\n${details}` : reason);
  try {
    await writeFile(failureReasonPath, reason, "utf-8");
  } catch {
    // sebep dosyası yazılamazsa cron geçmişi yalnızca log linkini gösterir.
  }
  process.exit(1);
}

// prompts/daily-ideas.md: "MealMate" / "MealMates" / "Meal-Mate" aynı sayılır.
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, "");
}

function warnings(ideas: IdeaInput[], trendUrls: Set<string> | null): string[] {
  const out: string[] = [];

  for (const idea of ideas) {
    if (!/^[A-Za-z0-9]{1,20}$/.test(idea.name)) {
      out.push(`"${idea.name}": isim ASCII/boşluksuz/en fazla 20 karakter kuralına uymuyor`);
    }
    if (trendUrls) {
      const unknown = idea.inspiration_sources.filter((url) => !trendUrls.has(url));
      if (unknown.length > 0) out.push(`"${idea.name}": trends.json'da geçmeyen kaynak URL'leri: ${unknown.join(", ")}`);
    }
  }

  const overalls = ideas.map((i) => i.scores.overall);
  const high = overalls.filter((s) => s >= 8).length;
  const low = overalls.filter((s) => s <= 5.5).length;
  if (high > 3) out.push(`overall >= 8.00 olan ${high} fikir var (beklenen en fazla 3)`);
  if (low < 2) out.push(`overall <= 5.50 olan ${low} fikir var (beklenen en az 2)`);

  for (const key of ["market", "feasibility_solo_dev", "originality", "overall"] as const) {
    const values = ideas.map((i) => i.scores[key]);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread < 3) out.push(`${key} puanlarında en yüksek-en düşük farkı ${spread.toFixed(2)} (beklenen en az 3.00)`);
  }

  const categories = new Set(ideas.map((i) => i.category.toLowerCase()));
  if (categories.size < 6) out.push(`${categories.size} farklı kategori var (beklenen en az 6)`);

  return out;
}

async function loadTrendUrls(trendsPath: string | undefined): Promise<Set<string> | null> {
  if (!trendsPath) return null;
  try {
    const summary = JSON.parse(await readFile(trendsPath, "utf-8")) as TrendSummary;
    return new Set(summary.sections.flatMap((s) => s.items.map((item) => item.url)));
  } catch {
    console.warn(`Uyarı: ${trendsPath} okunamadı, kaynak URL kontrolü atlandı.`);
    return null;
  }
}

async function main() {
  const [ideasPath, recentNamesPath, trendsPath] = process.argv.slice(2);
  if (!ideasPath || !recentNamesPath) {
    throw new Error("Kullanim: validate-ideas.ts <ideas.json> <recent-names.json> [trends.json]");
  }
  failureReasonPath = path.join(path.dirname(ideasPath), "failure-reason.txt");

  let rawIdeas: unknown;
  try {
    rawIdeas = JSON.parse(await readFile(ideasPath, "utf-8"));
  } catch (err) {
    return fail("Claude çıktısı (ideas.json) okunamadı veya geçerli JSON değil.", String(err));
  }

  if (Array.isArray(rawIdeas) && rawIdeas.length === 0) {
    return fail("Yetersiz trend verisi — fikir üretilmedi.");
  }

  const parsed = ideasArraySchema.safeParse(rawIdeas);
  if (!parsed.success) {
    return fail("Claude çıktısı şemaya uymuyor.", JSON.stringify(z.treeifyError(parsed.error), null, 2));
  }

  const { names: recentNames } = JSON.parse(await readFile(recentNamesPath, "utf-8")) as { names: string[] };
  const recentNormalized = new Set(recentNames.map(normalizeName));

  const dupesVsHistory = parsed.data.filter((idea) => recentNormalized.has(normalizeName(idea.name)));
  if (dupesVsHistory.length > 0) {
    return fail(`Geçmişle çakışan fikir adları: ${dupesVsHistory.map((d) => d.name).join(", ")}`);
  }

  const namesInBatch = parsed.data.map((idea) => normalizeName(idea.name));
  const dupesInBatch = parsed.data.filter((idea, i) => namesInBatch.indexOf(namesInBatch[i]) !== i);
  if (dupesInBatch.length > 0) {
    return fail(`Batch içinde tekrar eden isimler: ${dupesInBatch.map((d) => d.name).join(", ")}`);
  }

  const warningList = warnings(parsed.data, await loadTrendUrls(trendsPath));
  for (const w of warningList) console.warn(`Uyarı: ${w}`);

  console.log(`Dogrulama basarili: ${parsed.data.length} fikir, tekrar yok, ${warningList.length} uyari.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
