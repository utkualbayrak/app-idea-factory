import { readFile } from "node:fs/promises";
import { submitTrendSnapshots } from "./lib/api-client";
import type { TrendSummary } from "./lib/types";

// collect-trends.ts'in yazdığı trends.json'daki her bölümü trend_snapshots'a
// yazar (notes.txt madde 5) — Cron Geçmişi ekranından o günün toplanan/elenen
// öğelerine erişim için. CRON_RUN_ID, start-cron-run.ts'ten $GITHUB_ENV ile gelir.
async function main() {
  const trendsPath = process.argv[2];
  if (!trendsPath) throw new Error("Kullanım: submit-trend-snapshots.ts <trends.json path>");

  const summary = JSON.parse(await readFile(trendsPath, "utf-8")) as TrendSummary;
  const snapshots = summary.sections.map((section) => ({ source: section.source, payload: section }));

  await submitTrendSnapshots(process.env.CRON_RUN_ID, snapshots);
  console.log(`${snapshots.length} kaynak snapshot'ı yazıldı.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
