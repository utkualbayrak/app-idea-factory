import { appendFile } from "node:fs/promises";
import { createWorkflowRun, patchWorkflowRun } from "./lib/api-client";

// Kullanım: tsx start-workflow-run.ts <job id> <run url> <workflow dosyası> <idea id>
// reevaluate-idea.yml / find-competitors.yml başlarken Çalışma geçmişindeki
// satırı 'running' yapar. job id boşsa (workflow GitHub arayüzünden ya da
// `gh workflow run` ile job_id'siz tetiklendiyse) yeni bir satır açar — yoksa
// detay sayfası bu çalışmayı hiç görmez ve önceki (örn. başarısız) işi
// göstermeye devam ederdi. Kullanılan id $GITHUB_ENV'e WORKFLOW_RUN_ID olarak
// yazılır, bitiş adımı onu okur.
async function main() {
  const [jobId, runUrl, workflow, ideaId] = process.argv.slice(2);

  let runId = jobId;
  if (runId) {
    await patchWorkflowRun(runId, { status: "running", run_url: runUrl });
    console.log(`Workflow run ${runId} -> running`);
  } else {
    if (!workflow || !ideaId) throw new Error("job_id yokken workflow ve idea id argümanları gerekli");
    ({ id: runId } = await createWorkflowRun({ workflow, idea_id: ideaId, run_url: runUrl }));
    console.log(`job_id yok — yeni Çalışma geçmişi kaydı açıldı: ${runId}`);
  }

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    await appendFile(githubEnv, `WORKFLOW_RUN_ID=${runId}\n`, "utf-8");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
