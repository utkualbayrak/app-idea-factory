import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { submitTaskDocuments } from "./lib/api-client";
import { PLAN_DOCUMENT_FILES, type PlanDocumentKind } from "./lib/task-schema";

// Kullanım: tsx submit-plan-docs.ts <idea id> <docs dir>
// prompts/plan-idea.md'nin yazdığı 4 Markdown belgeyi kontrol edip API'ye
// gönderir. Eksik/boş belge varsa hiçbir şey göndermez (önceki belgeler
// korunur), okunabilir sebebi output/failure-reason.txt'ye yazar.
const MIN_LENGTH = 200;

async function fail(reason: string): Promise<never> {
  console.error(reason);
  await writeFile(path.join("output", "failure-reason.txt"), reason, "utf-8").catch(() => {});
  process.exit(1);
}

async function main() {
  const [ideaId, docsDir] = process.argv.slice(2);
  if (!ideaId || !docsDir) throw new Error("Kullanım: submit-plan-docs.ts <idea id> <docs dir>");

  const documents = {} as Record<PlanDocumentKind, string>;
  const problems: string[] = [];

  for (const [kind, file] of Object.entries(PLAN_DOCUMENT_FILES) as [PlanDocumentKind, string][]) {
    let content: string;
    try {
      content = (await readFile(path.join(docsDir, file), "utf-8")).trim();
    } catch {
      problems.push(`${file} yok`);
      continue;
    }
    if (content.length < MIN_LENGTH) problems.push(`${file} çok kısa (${content.length} karakter)`);
    else if (!content.startsWith("# ")) problems.push(`${file} bir "# " başlığıyla başlamıyor`);
    documents[kind] = content;
  }

  // prompts/plan-idea.md girdi geçersizse (fikir/parametre dosyası okunamadı,
  // zorunlu alan eksik) bilerek hiçbir dosya yazmıyor.
  if (Object.keys(documents).length === 0) {
    await fail("Claude hiç belge yazmadı — girdi (fikir ya da görev parametreleri) geçersiz bulunmuş olabilir, ayrıntılar loglarda.");
  }
  if (problems.length > 0) await fail(`Planlama belgeleri eksik veya geçersiz: ${problems.join(", ")}.`);

  await submitTaskDocuments(ideaId, documents);
  console.log(`Fikir ${ideaId} için ${Object.keys(documents).length} belge gönderildi.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
