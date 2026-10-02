import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchMergeInput } from "./lib/api-client";

// Kullanım: tsx fetch-pool.ts <output dir>
// Havuz bakımı girdisini <dir>/pool.json'a yazar (prompts/merge-ideas.md
// okur). Her fikir tek satırda: yüzlerce fikir olduğunda dosya Claude'un tek
// okumada görebileceği satır sayısında kalsın diye.
// Havuzda karşılaştırılacak bir şey yoksa (en az 2 fikir ya da 1 fikir + 1
// geliştirmedeki fikir) Claude atlanır: boş öneri dosyası yazılır ve
// $GITHUB_OUTPUT'a skip_claude=true düşer.
function lines(items: unknown[]) {
  return items.length === 0 ? "[]" : `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`;
}

async function main() {
  const outDir = process.argv[2] ?? "output";
  const input = await fetchMergeInput();
  await mkdir(outDir, { recursive: true });

  const json = [
    "{",
    `  "pool": ${lines(input.pool)},`,
    `  "dev_ideas": ${lines(input.dev_ideas)},`,
    `  "rejected_merges": ${lines(input.rejected_merges)},`,
    `  "previous_features": ${lines(input.previous_features)}`,
    "}",
    "",
  ].join("\n");
  await writeFile(path.join(outDir, "pool.json"), json, "utf-8");

  const skip = input.pool.length < 2 && !(input.pool.length === 1 && input.dev_ideas.length > 0);
  if (skip) {
    await writeFile(
      path.join(outDir, "proposals.json"),
      JSON.stringify({ status: "ok", merges: [], features: [] }),
      "utf-8",
    );
  }
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) await appendFile(githubOutput, `skip_claude=${skip}\n`, "utf-8");

  console.log(
    `Yazildi: ${outDir}/pool.json (havuz ${input.pool.length}, gelistirmede ${input.dev_ideas.length}, ` +
      `reddedilmis birlestirme ${input.rejected_merges.length}, onceki ozellik onerisi ${input.previous_features.length})` +
      (skip ? " — karsilastirilacak fikir yok, Claude atlanacak." : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
