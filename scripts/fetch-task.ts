import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchIdeaById, fetchIdeaTask } from "./lib/api-client";
import { taskParamsSchema } from "./lib/task-schema";

// Kullanım: tsx fetch-task.ts <idea id> <output dir>
// plan-idea.yml: fikri ve görev formunun parametrelerini Claude Code'un
// okuyacağı dosyalara yazar (<dir>/idea.json, <dir>/task-params.json).
async function main() {
  const [ideaId, outDir] = process.argv.slice(2);
  if (!ideaId || !outDir) throw new Error("Kullanım: fetch-task.ts <idea id> <output dir>");

  await mkdir(outDir, { recursive: true });
  const [idea, { task }] = await Promise.all([fetchIdeaById(ideaId), fetchIdeaTask(ideaId)]);

  if (!task) {
    await writeFile(path.join(outDir, "failure-reason.txt"), "Bu fikir için görev formu bulunamadı.", "utf-8");
    throw new Error(`Fikir ${ideaId} için görev yok`);
  }
  const params = taskParamsSchema.parse(task.params);

  await writeFile(path.join(outDir, "idea.json"), JSON.stringify(idea, null, 2), "utf-8");
  await writeFile(path.join(outDir, "task-params.json"), JSON.stringify(params, null, 2), "utf-8");
  console.log(`Yazildi: ${outDir}/idea.json, ${outDir}/task-params.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
