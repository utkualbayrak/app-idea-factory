import { appendFile } from "node:fs/promises";
import { fetchMergeDue, finishCronRun } from "./lib/api-client";

// Kullanım: tsx check-merge-due.ts [force]
// merge-ideas.yml her gün çalışır; bakım ancak son başarılı bakımdan bu yana
// Ayarlar'daki aralık (varsayılan 3 gün) geçtiyse yapılır. Sonuç
// $GITHUB_OUTPUT'a due=true/false olarak yazılır.
async function main() {
  const force = process.argv[2] === "true";
  const { due, last_success_at: lastAt, interval_days: interval } = await fetchMergeDue();
  const run = force || due;

  console.log(
    run
      ? `Bakım yapılacak${force && !due ? " (elle zorlandı)" : ""}. Son başarılı bakım: ${lastAt ?? "yok"}, aralık: ${interval} gün.`
      : `Bakım zamanı değil. Son başarılı bakım: ${lastAt}, aralık: ${interval} gün.`,
  );

  // Arayüzden açılmış bir kayıt varsa ve bakım yapılmayacaksa kayıt kapatılır.
  if (!run && process.env.RUN_ID) {
    await finishCronRun(process.env.RUN_ID, { status: "failed", error: "Bakım zamanı gelmediği için atlandı." });
  }

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) await appendFile(githubOutput, `due=${run}\n`, "utf-8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
