import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchIdeaById, fetchIdeaTask } from "./lib/api-client";
import { PLAN_DOCUMENT_FILES, taskParamsSchema } from "./lib/task-schema";

// Kullanım: tsx fetch-task.ts <idea id> <output dir> [docs dir]
// plan-idea.yml / build-skeleton.yml: fikri ve görev formunun parametrelerini
// Claude Code'un okuyacağı dosyalara yazar (<dir>/idea.json,
// <dir>/task-params.json). Görevin repo/issue adresleri <dir>/task.json'a
// yazılır. [docs dir] verilirse (yalnızca build-skeleton.yml) onaylı planlama
// belgeleri oraya yazılır. plan-idea.yml bunu bilerek vermez: eski belgeler
// Claude'un çıktı klasörüne düşerse, Claude bir dosyayı yazamadığında
// submit-plan-docs.ts eskisini yeni diye gönderirdi.
async function main() {
  const [ideaId, outDir, docsDir] = process.argv.slice(2);
  if (!ideaId || !outDir) throw new Error("Kullanım: fetch-task.ts <idea id> <output dir>");

  await mkdir(outDir, { recursive: true });
  const [idea, { task, documents }] = await Promise.all([fetchIdeaById(ideaId), fetchIdeaTask(ideaId)]);

  if (!task) {
    await writeFile(path.join(outDir, "failure-reason.txt"), "Bu fikir için görev formu bulunamadı.", "utf-8");
    throw new Error(`Fikir ${ideaId} için görev yok`);
  }
  const params = taskParamsSchema.parse(task.params);

  await writeFile(path.join(outDir, "idea.json"), JSON.stringify(idea, null, 2), "utf-8");
  await writeFile(path.join(outDir, "task-params.json"), JSON.stringify(params, null, 2), "utf-8");
  await writeFile(
    path.join(outDir, "task.json"),
    JSON.stringify({ id: task.id, status: task.status, repo_url: task.repo_url, issue_url: task.issue_url }, null, 2),
    "utf-8",
  );

  if (docsDir) {
    const missing = Object.keys(PLAN_DOCUMENT_FILES).filter((kind) => !documents.some((d) => d.kind === kind));
    if (missing.length > 0) {
      await writeFile(path.join(outDir, "failure-reason.txt"), `Planlama belgeleri eksik: ${missing.join(", ")}.`, "utf-8");
      throw new Error(`Eksik belgeler: ${missing.join(", ")}`);
    }
    await mkdir(docsDir, { recursive: true });
    for (const doc of documents) {
      const file = PLAN_DOCUMENT_FILES[doc.kind as keyof typeof PLAN_DOCUMENT_FILES];
      if (file) await writeFile(path.join(docsDir, file), doc.content.trimEnd() + "\n", "utf-8");
    }
  }
  console.log(`Yazildi: ${outDir}/idea.json, task-params.json, task.json${docsDir ? `, ${documents.length} belge → ${docsDir}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
