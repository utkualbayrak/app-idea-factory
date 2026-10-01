import { patchWorkflowRun } from "./lib/api-client";

// Kullanım: tsx start-workflow-run.ts <job id> <run url>
// reevaluate-idea.yml / find-competitors.yml başlarken Çalışma geçmişindeki
// satırı 'running' yapar. job id boşsa (workflow GitHub arayüzünden elle,
// job_id'siz tetiklendiyse) sessizce atlar.
async function main() {
  const [jobId, runUrl] = process.argv.slice(2);
  if (!jobId) {
    console.log("job_id yok — Çalışma geçmişi kaydı atlanıyor.");
    return;
  }
  await patchWorkflowRun(jobId, { status: "running", run_url: runUrl });
  console.log(`Workflow run ${jobId} -> running`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
