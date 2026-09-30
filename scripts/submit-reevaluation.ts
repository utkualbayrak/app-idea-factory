import { readFile } from "node:fs/promises";
import { z } from "zod";
import { reevaluationSchema } from "./lib/idea-schema";
import { submitReevaluation } from "./lib/api-client";

// Claude Code'un yazdığı reevaluation.json'ı doğrular ve API'ye yazar
// (docs/PROJE.md Akış 1 adım 5'teki "gönderilmeden önce erken doğrulama"
// desenini reevaluate-idea.yml için tekrarlıyor).
async function main() {
  const [id, dataPath] = process.argv.slice(2);
  if (!id || !dataPath) throw new Error("Kullanım: submit-reevaluation.ts <idea id> <reevaluation.json path>");

  const raw: unknown = JSON.parse(await readFile(dataPath, "utf-8"));
  const parsed = reevaluationSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    process.exit(1);
  }

  await submitReevaluation(id, parsed.data);
  console.log(`Fikir ${id} yeniden değerlendirildi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
