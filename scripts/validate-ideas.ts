import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ideasArraySchema } from "./lib/idea-schema";

async function main() {
  const [ideasPath, recentNamesPath] = process.argv.slice(2);
  if (!ideasPath || !recentNamesPath) {
    throw new Error("Kullanim: validate-ideas.ts <ideas.json> <recent-names.json>");
  }

  const rawIdeas: unknown = JSON.parse(await readFile(ideasPath, "utf-8"));
  const parsed = ideasArraySchema.safeParse(rawIdeas);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    process.exit(1);
  }

  const { names: recentNames } = JSON.parse(await readFile(recentNamesPath, "utf-8")) as { names: string[] };
  const recentLower = new Set(recentNames.map((n) => n.toLowerCase()));

  const dupesVsHistory = parsed.data.filter((idea) => recentLower.has(idea.name.toLowerCase()));
  if (dupesVsHistory.length > 0) {
    console.error("Gecmisle cakisan fikir adlari:", dupesVsHistory.map((d) => d.name).join(", "));
    process.exit(1);
  }

  const namesInBatch = parsed.data.map((idea) => idea.name.toLowerCase());
  const dupesInBatch = namesInBatch.filter((name, i) => namesInBatch.indexOf(name) !== i);
  if (dupesInBatch.length > 0) {
    console.error("Batch icinde tekrar eden isimler:", [...new Set(dupesInBatch)].join(", "));
    process.exit(1);
  }

  console.log(`Dogrulama basarili: ${parsed.data.length} fikir, tekrar yok.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
