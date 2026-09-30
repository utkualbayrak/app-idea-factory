import { readFile } from "node:fs/promises";
import { submitIdeasBatch } from "./lib/api-client";

async function main() {
  const ideasPath = process.argv[2];
  const batchDate = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  if (!ideasPath) {
    throw new Error("Kullanim: submit-ideas.ts <ideas.json> [batch_date]");
  }

  const ideas: unknown[] = JSON.parse(await readFile(ideasPath, "utf-8"));
  const result = await submitIdeasBatch(batchDate, ideas);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
