import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { reportTaskBuild } from "./lib/api-client";
import { commentOnIssue } from "./lib/github";
import { skeletonReportSchema, type SkeletonReport } from "./lib/task-schema";

// Kullanım:
//   tsx finish-skeleton.ts check <output dir>            → raporu doğrular; status 'failed' ise çıkış 1
//   tsx finish-skeleton.ts success <idea id> <output dir> → issue'ya özet yorum + görevi 'done' bildirir
//   tsx finish-skeleton.ts failed <idea id> <output dir>  → issue'ya hata yorumu (görevi workflow_runs bitişi 'failed' yapar)
// SKELETON_REPO / SKELETON_ISSUE_NUMBER / RUN_URL env'den okunur.
const CHECK_LABELS: Record<string, string> = { passed: "✅ geçti", failed: "❌ başarısız", skipped: "— atlandı" };

async function readReport(outDir: string): Promise<SkeletonReport | null> {
  try {
    const parsed = skeletonReportSchema.safeParse(JSON.parse(await readFile(path.join(outDir, "skeleton-report.json"), "utf-8")));
    if (!parsed.success) {
      console.error("Rapor şemaya uymuyor:\n" + JSON.stringify(z.treeifyError(parsed.error), null, 2));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function checksMarkdown(report: SkeletonReport): string {
  return [
    `- Kurulum: ${CHECK_LABELS[report.checks.install]}`,
    `- Tip kontrolü: ${CHECK_LABELS[report.checks.typecheck]}`,
    `- Lint: ${CHECK_LABELS[report.checks.lint]}`,
  ].join("\n");
}

async function writeReason(outDir: string, reason: string) {
  await writeFile(path.join(outDir, "failure-reason.txt"), reason, "utf-8").catch(() => {});
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const runUrl = process.env.RUN_URL ?? "";
  const repo = process.env.SKELETON_REPO;
  const issueNumber = Number(process.env.SKELETON_ISSUE_NUMBER);

  if (mode === "check") {
    const [outDir] = rest;
    const report = await readReport(outDir);
    if (!report) {
      await writeReason(outDir, "Claude iskelet raporu yazmadı ya da rapor geçersiz (iş yarıda kalmış olabilir).");
      process.exit(1);
    }
    if (report.status !== "ok") {
      await writeReason(outDir, `Claude iskeleti tamamlayamadı: ${report.notes ?? report.summary}`.slice(0, 500));
      process.exit(1);
    }
    console.log("Rapor: ok");
    return;
  }

  const [ideaId, outDir] = rest;
  if ((mode !== "success" && mode !== "failed") || !ideaId || !outDir) {
    throw new Error("Kullanım: finish-skeleton.ts <check|success|failed> ...");
  }
  const report = await readReport(outDir);

  if (mode === "success") {
    if (repo && issueNumber && report) {
      await commentOnIssue(
        repo,
        issueNumber,
        [`## ✅ İskelet hazır`, "", report.summary, "", "### Kontroller", checksMarkdown(report), ...(report.notes ? ["", report.notes] : []), "", `Çalışma: ${runUrl}`].join("\n"),
      );
    }
    await reportTaskBuild({ idea_id: ideaId, status: "done" });
    console.log("Görev 'done' olarak bildirildi.");
    return;
  }

  // failed: yalnızca issue'ya bilgi düşülür; görev durumunu finish-workflow-run.ts işler.
  if (!repo || !issueNumber) {
    console.log("Issue yok (repo hazırlanmadan patladı) — yorum atlanıyor.");
    return;
  }
  let reason = "Ayrıntılar loglarda.";
  try {
    reason = (await readFile(path.join(outDir, "failure-reason.txt"), "utf-8")).trim() || reason;
  } catch {
    // sebep dosyası yok
  }
  await commentOnIssue(
    repo,
    issueNumber,
    [
      `## ❌ İskelet üretimi başarısız`,
      "",
      reason,
      ...(report ? ["", "### Kontroller", checksMarkdown(report)] : []),
      "",
      "Repoya o ana kadar üretilen içerik itildi (varsa). Uygulamadaki \"Tekrar dene\" aynı repo ve belgelerle baştan çalışır.",
      "",
      `Çalışma: ${runUrl}`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
