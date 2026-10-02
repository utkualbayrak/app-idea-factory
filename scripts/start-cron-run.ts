import { appendFile } from "node:fs/promises";
import { markCronRunStarted, startCronRun } from "./lib/api-client";

// Kullanım: tsx start-cron-run.ts [daily|merge] [run url]
// Cron geçmişi ekranı için: çalışmanın başladığını kaydeder, id'yi
// $GITHUB_ENV'e yazar (finish-cron-run.ts, iş başarısız olsa da `if: always()`
// ile aynı id'yi okuyup satırı kapatabilsin diye).
// RUN_ID env'i doluysa (iş arayüzden tetiklendi, kayıt API'de tetikleme anında
// açıldı) yeni kayıt açılmaz, o kayda log adresi yazılır.
async function main() {
  const kind = process.argv[2] === "merge" ? "merge" : "daily";
  const runUrl = process.argv[3] || undefined;
  const existing = process.env.RUN_ID;

  let id: string;
  if (existing) {
    await markCronRunStarted(existing, runUrl);
    id = existing;
  } else {
    id = await startCronRun(kind, runUrl);
  }

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    await appendFile(githubEnv, `CRON_RUN_ID=${id}\n`, "utf-8");
  }
  console.log(`CRON_RUN_ID=${id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
