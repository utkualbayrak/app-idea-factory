import { readFile } from "node:fs/promises";
import { z } from "zod";
import { competitorsArraySchema } from "./lib/idea-schema";
import { submitCompetitors } from "./lib/api-client";

async function main() {
  const [id, dataPath] = process.argv.slice(2);
  if (!id || !dataPath) throw new Error("Kullanım: submit-competitors.ts <idea id> <competitors.json path>");

  const raw: unknown = JSON.parse(await readFile(dataPath, "utf-8"));
  const parsed = competitorsArraySchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    process.exit(1);
  }

  await submitCompetitors(id, parsed.data);
  console.log(`Fikir ${id} icin ${parsed.data.length} rakip kaydedildi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
