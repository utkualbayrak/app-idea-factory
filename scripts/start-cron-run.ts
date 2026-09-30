import { appendFile } from "node:fs/promises";
import { startCronRun } from "./lib/api-client";

// Cron geçmişi ekranı için: çalışmanın başladığını kaydeder, id'yi
// $GITHUB_ENV'e yazar (finish-cron-run.ts, iş başarısız olsa da `if: always()`
// ile aynı id'yi okuyup satırı kapatabilsin diye).
async function main() {
  const id = await startCronRun();

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
