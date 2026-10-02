import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { finalizeMaintenance } from "./lib/api-client";

// Kullanım: tsx finalize-maintenance.ts <output dir>
// merge-ideas.yml'ın son adımı: API süresi dolan arşivlenmiş/silinmiş fikirleri
// kalıcı siler, bakım puanı art arda düşük kalan fikirleri arşivler. Sayılar
// submit-proposals.ts'in yazdığı run-summary.json'a eklenir.
async function main() {
  const outDir = process.argv[2] ?? "output";
  const result = await finalizeMaintenance(process.env.CRON_RUN_ID || undefined);
  console.log(
    `Kalıcı silinen: ${result.purged}, arşivlenen: ${result.archived}, arşive yaklaşan: ${result.approaching}.`,
  );

  const summaryPath = path.join(outDir, "run-summary.json");
  let summary: Record<string, number> = {};
  try {
    summary = JSON.parse(await readFile(summaryPath, "utf-8"));
  } catch {
    // öneri adımı özet yazmadıysa yalnızca bu sayılar gider.
  }
  await writeFile(summaryPath, JSON.stringify({ ...summary, archived: result.archived, purged: result.purged }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
