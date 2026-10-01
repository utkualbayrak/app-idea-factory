import { readFile } from "node:fs/promises";
import path from "node:path";
import { finishCronRun } from "./lib/api-client";
import type { TrendSummary } from "./lib/types";

// Kullanım: tsx finish-cron-run.ts <success|failed> [trends-json-path] [hata mesajı]
// $GITHUB_ENV'e start-cron-run.ts'in yazdığı CRON_RUN_ID'yi okur. Workflow'da
// `if: always()` ile çağrılır ki iş ortada patlasa da geçmişte "failed"
// olarak görünsün, sessizce kaybolmasın.
async function main() {
  const [status, trendsPath, errorMessage] = process.argv.slice(2);
  if (status !== "success" && status !== "failed") {
    throw new Error("İlk argüman 'success' veya 'failed' olmalı");
  }

  const id = process.env.CRON_RUN_ID;
  if (!id) {
    console.log("CRON_RUN_ID yok (start-cron-run.ts çalışmamış olabilir) — atlanıyor.");
    return;
  }

  let sourceBreakdown: Record<string, number> | undefined;
  if (trendsPath) {
    try {
      const summary = JSON.parse(await readFile(trendsPath, "utf-8")) as TrendSummary;
      sourceBreakdown = Object.fromEntries(summary.sections.map((s) => [s.source, s.items.length]));
    } catch {
      // trends.json henüz yazılmamış olabilir (örn. erken bir adımda hata) — sorun değil.
    }
  }

  // validate-ideas.ts gibi adımlar okunabilir bir hata sebebini
  // output/failure-reason.txt'e yazar; varsa log linkinin önüne eklenir
  // (Cron Geçmişi ekranı sondaki URL'yi ayrıca link olarak gösterir).
  let error = errorMessage;
  if (status === "failed") {
    const reasonPath = path.join(trendsPath ? path.dirname(trendsPath) : "output", "failure-reason.txt");
    try {
      const reason = (await readFile(reasonPath, "utf-8")).trim();
      if (reason) error = errorMessage ? `${reason} | ${errorMessage}` : reason;
    } catch {
      // sebep dosyası yok — yalnızca log linki gider.
    }
  }

  await finishCronRun(id, {
    status,
    source_breakdown: sourceBreakdown,
    error,
  });
  console.log(`Cron run ${id} -> ${status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
