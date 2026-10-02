import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchIdeaById, fetchIdeaCompetitors } from "./lib/api-client";

// reevaluate-idea.yml / find-competitors.yml: workflow_dispatch input'tan
// gelen tek bir fikri Claude Code'un okuyabileceği bir dosyaya yazar.
// --with-competitors: kayıtlı rakipleri `competitors` alanı olarak ekler
// (yalnızca reevaluate; find-competitors eski sonuçlardan etkilenmesin diye almaz).
async function main() {
  const args = process.argv.slice(2);
  const withCompetitors = args.includes("--with-competitors");
  const [id, outPath] = args.filter((a) => a !== "--with-competitors");
  if (!id || !outPath) throw new Error("Kullanım: fetch-idea.ts <idea id> <output path> [--with-competitors]");

  const idea = (await fetchIdeaById(id)) as Record<string, unknown>;
  const output = withCompetitors ? { ...idea, competitors: await fetchIdeaCompetitors(id) } : idea;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Yazildi: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
