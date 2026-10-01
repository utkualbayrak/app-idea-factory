import { readFile } from "node:fs/promises";
import { z } from "zod";
import { competitorsOutputSchema } from "./lib/idea-schema";
import { submitCompetitors } from "./lib/api-client";

// prompts/find-competitors.md'nin yazdığı competitors.json'ı doğrular ve
// API'ye yazar. status 'ok' değilse (arama aracı çalışmadı / girdi okunamadı)
// mevcut rakipler silinmesin diye hiçbir şey gönderilmez ve iş başarısız
// biter — boş bir 'ok' sonucuyla ("piyasada rakip yok") karışmasın.
async function main() {
  const [id, dataPath] = process.argv.slice(2);
  if (!id || !dataPath) throw new Error("Kullanım: submit-competitors.ts <idea id> <competitors.json path>");

  const raw: unknown = JSON.parse(await readFile(dataPath, "utf-8"));
  const parsed = competitorsOutputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    process.exit(1);
  }

  const { status, competitors } = parsed.data;
  if (status !== "ok") {
    const reason = status === "search_failed" ? "web araması çalışmadı" : "fikir girdisi okunamadı";
    console.error(`Rakip bulma tamamlanamadı (${status}: ${reason}) — mevcut rakipler korunuyor.`);
    process.exit(1);
  }

  await submitCompetitors(id, competitors);
  console.log(`Fikir ${id} icin ${competitors.length} rakip kaydedildi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
