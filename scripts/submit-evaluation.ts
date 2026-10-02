import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { evaluationOutputSchema } from "./lib/idea-schema";
import { submitEvaluation } from "./lib/api-client";

// Kullanım: tsx submit-evaluation.ts <idea id> <evaluation.json path>
// evaluate-idea.yml: Claude'un yazdığı evaluation.json'ı doğrular ve API'ye
// yazar. Hata durumunda okunur sebep output/failure-reason.txt'ye yazılır
// (finish-workflow-run.ts onu Çalışma geçmişine taşır) ve fikre dokunulmaz.
async function fail(dataPath: string, reason: string): Promise<never> {
  console.error(reason);
  await writeFile(path.join(path.dirname(dataPath), "failure-reason.txt"), reason, "utf-8").catch(() => {});
  process.exit(1);
}

async function main() {
  const [id, dataPath] = process.argv.slice(2);
  if (!id || !dataPath) throw new Error("Kullanım: submit-evaluation.ts <idea id> <evaluation.json path>");

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(dataPath, "utf-8"));
  } catch (err) {
    console.error(err);
    return fail(dataPath, "Claude değerlendirme çıktısı üretmedi (evaluation.json yok veya geçersiz).");
  }

  const parsed = evaluationOutputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    return fail(dataPath, "Claude çıktısı şemaya uymuyor.");
  }
  const { status, error, scores, tags, category, fields } = parsed.data;
  if (status !== "ok") return fail(dataPath, `Claude fikri değerlendiremedi: ${error ?? "girdi hatası"}`);
  if (!scores || !tags || !category) return fail(dataPath, "Claude çıktısında puan, etiket ya da kategori eksik.");

  try {
    await submitEvaluation(id, { scores, tags, category, fields });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // API isim çakışmasını 409 ile reddeder (fetchJson mesajında "status=409").
    return fail(
      dataPath,
      message.includes("status=409")
        ? `Claude'un önerdiği ad (${fields?.name ?? "?"}) başka bir fikirle çakışıyor.`
        : `Sonuç API'ye yazılamadı: ${message.split("\n").slice(0, 2).join(" ")}`,
    );
  }
  console.log(`Fikir ${id} değerlendirildi${fields ? " (alanlar dolduruldu)" : ""}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
