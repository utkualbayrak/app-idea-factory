import { readFile } from "node:fs/promises";
import { patchWorkflowRun } from "./lib/api-client";

// Kullanım: tsx finish-workflow-run.ts <job id> <success|failed> [failure-reason dosyası]
// Workflow'da `if: always()` ile çağrılır ki iş ortada patlasa da Çalışma
// geçmişinde "failed" görünsün, "running"de asılı kalmasın. Başarısızlıkta
// submit-* script'lerinin yazdığı okunabilir sebep dosyası varsa error'a konur.
async function main() {
  const [jobId, status, reasonPath] = process.argv.slice(2);
  if (status !== "success" && status !== "failed") {
    throw new Error("İkinci argüman 'success' veya 'failed' olmalı");
  }
  if (!jobId) {
    console.log("job_id yok — Çalışma geçmişi kaydı atlanıyor.");
    return;
  }

  let error: string | null = null;
  if (status === "failed") {
    error = "İş başarısız oldu, ayrıntılar loglarda.";
    if (reasonPath) {
      try {
        const reason = (await readFile(reasonPath, "utf-8")).trim();
        if (reason) error = reason;
      } catch {
        // sebep dosyası yok — genel mesaj kalır.
      }
    }
  }

  await patchWorkflowRun(jobId, { status, error });
  console.log(`Workflow run ${jobId} -> ${status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
