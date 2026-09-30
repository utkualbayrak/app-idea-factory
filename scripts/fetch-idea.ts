import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchIdeaById } from "./lib/api-client";

// reevaluate-idea.yml / find-competitors.yml: workflow_dispatch input'tan
// gelen tek bir fikri Claude Code'un okuyabileceği bir dosyaya yazar.
async function main() {
  const [id, outPath] = process.argv.slice(2);
  if (!id || !outPath) throw new Error("Kullanım: fetch-idea.ts <idea id> <output path>");

  const idea = await fetchIdeaById(id);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(idea, null, 2), "utf-8");
  console.log(`Yazildi: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
