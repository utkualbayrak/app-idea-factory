import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { proposalsOutputSchema } from "./lib/idea-schema";
import { submitProposals } from "./lib/api-client";

// Kullanım: tsx submit-proposals.ts <proposals.json path>
// merge-ideas.yml: Claude'un önerilerini doğrular ve API'ye gönderir. API el
// değmemiş fikirlerin birleştirmesini hemen uygular, geçersiz önerileri atlar
// (sebepleri loga yazılır). Sayılar output/run-summary.json'a yazılır
// (finish-cron-run.ts Çalışma geçmişine taşır). Hata sebebi
// output/failure-reason.txt'ye.
async function fail(outDir: string, reason: string): Promise<never> {
  console.error(reason);
  await writeFile(path.join(outDir, "failure-reason.txt"), reason, "utf-8").catch(() => {});
  process.exit(1);
}

async function main() {
  const [dataPath] = process.argv.slice(2);
  if (!dataPath) throw new Error("Kullanım: submit-proposals.ts <proposals.json path>");
  const outDir = path.dirname(dataPath);

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(dataPath, "utf-8"));
  } catch (err) {
    console.error(err);
    return fail(outDir, "Claude öneri çıktısı üretmedi (proposals.json yok veya geçersiz).");
  }

  const parsed = proposalsOutputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Sema hatasi:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
    return fail(outDir, "Claude çıktısı şemaya uymuyor.");
  }
  const { status, error, merges, features } = parsed.data;
  if (status !== "ok") return fail(outDir, `Claude havuzu değerlendiremedi: ${error ?? "girdi hatası"}`);

  if (merges.length === 0 && features.length === 0) {
    console.log("Öneri yok.");
    await writeFile(path.join(outDir, "run-summary.json"), JSON.stringify({ merges_applied: 0, merges_pending: 0, features: 0, skipped: 0 }));
    return;
  }

  let result: Awaited<ReturnType<typeof submitProposals>>;
  try {
    result = await submitProposals({ run_id: process.env.CRON_RUN_ID || undefined, merges, features });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(outDir, `Öneriler API'ye yazılamadı: ${message.split("\n").slice(0, 2).join(" ")}`);
  }

  for (const reason of result.skipped) console.warn(`UYARI: ${reason}`);
  console.log(
    `Birleştirme: ${result.merges_applied} otomatik uygulandı, ${result.merges_pending} onay bekliyor. ` +
      `Özellik önerisi: ${result.features}. Atlanan: ${result.skipped.length}.`,
  );
  await writeFile(
    path.join(outDir, "run-summary.json"),
    JSON.stringify({
      merges_applied: result.merges_applied,
      merges_pending: result.merges_pending,
      features: result.features,
      skipped: result.skipped.length,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
