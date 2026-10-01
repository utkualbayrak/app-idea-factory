import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { reevaluationSchema } from "./lib/idea-schema";
import { submitReevaluation } from "./lib/api-client";

// Claude Code'un yazdığı reevaluation.json'ı doğrular ve API'ye yazar
// (docs/PROJE.md Akış 1 adım 5'teki "gönderilmeden önce erken doğrulama"
// desenini reevaluate-idea.yml için tekrarlıyor).
async function main() {
  const [id, dataPath] = process.argv.slice(2);
  if (!id || !dataPath) throw new Error("Kullanım: submit-reevaluation.ts <idea id> <reevaluation.json path>");

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(dataPath, "utf-8"));
  } catch (err) {
    // Prompt, girdi okunamazsa bilerek hiç çıktı yazmıyor.
    console.error(err);
    await writeFile(
      path.join(path.dirname(dataPath), "failure-reason.txt"),
      "Claude değerlendirme çıktısı üretmedi (reevaluation.json yok veya geçersiz).",
      "utf-8",
    ).catch(() => {});
    process.exit(1);
  }
  const parsed = reevaluationSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    await writeFile(path.join(path.dirname(dataPath), "failure-reason.txt"), "Claude çıktısı şemaya uymuyor.", "utf-8").catch(
      () => {},
    );
    process.exit(1);
  }

  await submitReevaluation(id, parsed.data);
  console.log(`Fikir ${id} yeniden değerlendirildi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
