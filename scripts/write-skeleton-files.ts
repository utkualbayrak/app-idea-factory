import { mkdir, readdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { PLAN_DOCUMENT_FILES } from "./lib/task-schema";

// Kullanım: tsx write-skeleton-files.ts <output dir> <skeleton dir>
// build-skeleton.yml: clone edilen iskelet reposunu Claude'a hazırlar.
// .git dışındaki her şey silinir (ilk denemede auto_init README'si, tekrar
// denemede önceki denemenin içeriği — "aynı repo, içerik üzerine yazılır"),
// sonra onaylı belgeler docs/ altına ve fikrin tam JSON'u IDEA.md'ye yazılır.
// Git geçmişi korunur.
const IDEA_FIELDS = [
  "name",
  "one_liner",
  "problem",
  "target_audience",
  "core_features",
  "monetization",
  "category",
  "inspiration_sources",
  "tags",
  "scores",
  "user_rating",
  "user_note",
] as const;

async function main() {
  const [outDir, skeletonDir] = process.argv.slice(2);
  if (!outDir || !skeletonDir) throw new Error("Kullanım: write-skeleton-files.ts <output dir> <skeleton dir>");

  for (const entry of await readdir(skeletonDir)) {
    if (entry === ".git") continue;
    await rm(path.join(skeletonDir, entry), { recursive: true, force: true });
  }

  await mkdir(path.join(skeletonDir, "docs"), { recursive: true });
  for (const file of Object.values(PLAN_DOCUMENT_FILES)) {
    await copyFile(path.join(outDir, "approved-docs", file), path.join(skeletonDir, "docs", file));
  }

  const idea = JSON.parse(await readFile(path.join(outDir, "idea.json"), "utf-8")) as Record<string, unknown>;
  const picked = Object.fromEntries(IDEA_FIELDS.filter((key) => key in idea).map((key) => [key, idea[key]]));
  const ideaMd = [
    `# ${String(idea.name)}`,
    "",
    String(idea.one_liner),
    "",
    "Bu repo Ideas tarafından üretilen bir fikrin iskeletidir. Planlama belgeleri `docs/` altında.",
    "",
    "```json",
    JSON.stringify(picked, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFile(path.join(skeletonDir, "IDEA.md"), ideaMd, "utf-8");

  console.log(`İskelet klasörü hazır: ${skeletonDir} (docs/ + IDEA.md)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
