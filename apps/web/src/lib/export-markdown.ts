import type { Competitor, DevReport, Idea, RepoState, Task, TaskDocument, TestRound } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/idea-colors";
import {
  AUTH_LABELS,
  BACKEND_LABELS,
  DOCUMENT_LABELS,
  DOCUMENT_REPO_PATHS,
  PLATFORM_LABELS,
  STYLE_LABELS,
  TARGET_LABELS,
  TASK_STATUS_LABELS,
  THEME_LABELS,
} from "@/lib/task-labels";
import {
  FINDING_KIND_LABELS,
  FINDING_PLATFORM_LABELS,
  ROUND_STATUS_LABELS,
  SCENARIO_RESULT_LABELS,
  SEVERITY_LABELS,
  TEST_CHANNEL_LABELS,
  TEST_PLATFORM_LABELS,
} from "@/lib/test-labels";
import { formatBatchDate, formatDate } from "@/lib/format-date";

// Fikri (ve bulunduğu aşamaya kadar biriken her şeyi) okunabilir Markdown
// olarak dışa aktarmak için — başka bir AI'a yapıştırmak ya da dosya olarak
// saklamak amacıyla. Detay sayfasında ne yüklüyse o eklenir.
export interface IdeaExport {
  idea: Idea;
  competitors?: Competitor[] | null;
  task?: Task | null;
  documents?: TaskDocument[];
  repo?: RepoState | null;
  devReports?: DevReport[];
  testRounds?: TestRound[];
}

const SIMILARITY_LABELS = { direct: "doğrudan", partial: "kısmi", alternative: "alternatif" } as const;

const DOCUMENT_ORDER = ["prd", "screens", "tech_plan", "roadmap"] as const;

// Belgedeki başlıkları bir alt seviyeye indirir; dışa aktarılan dosyada tek
// bir "# Fikir adı" başlığı kalsın.
function demoteHeadings(markdown: string, by: number): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line.replace(/^(#{1,6})(\s)/, (_, hashes: string, space: string) =>
        `${"#".repeat(Math.min(6, hashes.length + by))}${space}`,
      );
    })
    .join("\n");
}

// Plan belgesinin en güncel hali: repo senkronlandıysa ve oradaki sürüm
// farklıysa repodaki, değilse onaylı.
export function currentDocumentContent(doc: TaskDocument, repo: RepoState | null | undefined): {
  content: string;
  fromRepo: boolean;
} {
  const repoContent = repo?.files.find((f) => f.path === DOCUMENT_REPO_PATHS[doc.kind])?.content ?? null;
  if (repoContent != null && repoContent.trim() !== doc.content.trim()) return { content: repoContent, fromRepo: true };
  return { content: doc.content, fromRepo: false };
}

function ideaSection(idea: Idea): string[] {
  const lines: string[] = [
    `# ${idea.name}`,
    "",
    idea.one_liner,
    "",
    `**Kategori:** ${idea.category} · **Durum:** ${STATUS_LABELS[idea.status] ?? idea.status}`,
    "",
    "## Problem",
    idea.problem,
    "",
    "## Hedef kitle",
    idea.target_audience,
    "",
    "## Temel özellikler",
    ...idea.core_features.map((f) => `- ${f}`),
    "",
    "## Gelir modeli",
    idea.monetization,
    "",
  ];

  if (idea.inspiration_sources.length > 0) {
    lines.push("## İlham kaynakları", ...idea.inspiration_sources.map((s) => `- ${s}`), "");
  }

  if (idea.tags.length > 0) {
    lines.push(`**Etiketler:** ${idea.tags.join(", ")}`, "");
  }

  const { scores } = idea;
  if (scores) {
    lines.push(
      "## Claude puan dökümü",
      `- Pazar: ${scores.market.toFixed(2)}/10 — ${scores.market_reason}`,
      `- Uygulanabilirlik (solo): ${scores.feasibility_solo_dev.toFixed(2)}/10 — ${scores.feasibility_solo_dev_reason}`,
      `- Özgünlük: ${scores.originality.toFixed(2)}/10 — ${scores.originality_reason}`,
      `- Genel: ${scores.overall.toFixed(2)}/10 — ${scores.overall_reason}`,
      "",
    );
  } else {
    lines.push("## Claude puan dökümü", "Henüz puanlanmadı.", "");
  }

  if (idea.user_rating != null) {
    lines.push(`**Kullanıcı puanı:** ${idea.user_rating.toFixed(2)}/10`, "");
  }

  if (idea.user_note) {
    lines.push("## Kullanıcı notu", idea.user_note, "");
  }

  return lines;
}

function competitorsSection(competitors: Competitor[]): string[] {
  return [
    "## Rakipler",
    ...competitors.map((c) => {
      const name = c.url ? `[${c.app_name}](${c.url})` : c.app_name;
      const similarity = c.similarity ? ` (${SIMILARITY_LABELS[c.similarity]})` : "";
      return `- ${name}${similarity}${c.note ? ` — ${c.note}` : ""}`;
    }),
    "",
  ];
}

function taskSection(task: Task): string[] {
  const { params } = task;
  const lines = [
    "## Geliştirme görevi",
    `- Durum: ${TASK_STATUS_LABELS[task.status]}`,
    `- Platform: ${PLATFORM_LABELS[params.platform]} · Hedef: ${params.targets.map((t) => TARGET_LABELS[t]).join(", ")}`,
    `- Backend: ${BACKEND_LABELS[params.backend]} · Giriş: ${AUTH_LABELS[params.auth]}`,
    `- Tasarım: ${THEME_LABELS[params.design.theme]}, ${STYLE_LABELS[params.design.style]}`,
  ];
  if (task.repo_url) lines.push(`- Repo: ${task.repo_url}`);
  if (task.issue_url) lines.push(`- Issue: ${task.issue_url}`);
  lines.push("", "### MVP özellikleri", ...params.mvp_features.map((f) => `- ${f}`), "");
  if (params.notes) lines.push("### Notlar", params.notes, "");
  return lines;
}

function documentsSection(documents: TaskDocument[], repo: RepoState | null | undefined): string[] {
  const lines = ["## Planlama belgeleri", ""];
  for (const kind of DOCUMENT_ORDER) {
    const doc = documents.find((d) => d.kind === kind);
    if (!doc) continue;
    const { content, fromRepo } = currentDocumentContent(doc, repo);
    lines.push(
      `### ${DOCUMENT_LABELS[kind]}${fromRepo ? " (repodaki sürüm)" : ""}`,
      "",
      demoteHeadings(content.trim(), 3),
      "",
    );
  }
  return lines;
}

function list(title: string, items: string[]): string[] {
  return items.length > 0 ? [`**${title}:**`, ...items.map((i) => `- ${i}`), ""] : [];
}

function devReportsSection(reports: DevReport[]): string[] {
  const lines = ["## Geliştirme raporları", ""];
  for (const report of [...reports].sort((a, b) => a.round - b.round)) {
    const done = report.roadmap_items.filter((i) => i.done).length;
    lines.push(
      `### Tur ${report.round} · ${formatDate(report.updated_at)}`,
      "",
      `Yol haritası: ${done}/${report.roadmap_items.length} madde tamam.`,
      "",
      ...list(
        "Tamamlanmayanlar",
        report.roadmap_items.filter((i) => !i.done).map((i) => (i.phase ? `${i.phase}: ${i.text}` : i.text)),
      ),
      ...list("Eksik özellikler", report.missing_features),
      ...list("Ek özellikler", report.extra_features),
      ...list("Notlar", report.notes),
    );
  }
  return lines;
}

function testRoundsSection(rounds: TestRound[]): string[] {
  const lines = ["## Test turları", ""];
  for (const round of [...rounds].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const { plan, result } = round;
    lines.push(
      `### Tur ${round.round} · ${ROUND_STATUS_LABELS[round.status]} · ${formatBatchDate(plan.start_date)}`,
      "",
      `Plan: ${plan.tester_count} testçi, ${plan.duration_days} gün, ${plan.platforms
        .map((p) => TEST_PLATFORM_LABELS[p])
        .join(", ")}, ${TEST_CHANNEL_LABELS[plan.channel]}`,
      "",
      ...list("Başarı kriterleri", plan.success_criteria),
    );
    if (result) {
      lines.push(
        `Gerçekleşen: ${result.actual_tester_count} testçi, ${result.actual_days} gün` +
          (result.satisfaction != null ? `, memnuniyet ${result.satisfaction}/10` : ""),
        "",
        ...list(
          "Senaryolar",
          result.scenario_results.map((s) => `${s.scenario} — ${SCENARIO_RESULT_LABELS[s.result]}`),
        ),
        ...list(
          "Bulgular",
          result.findings.map(
            (f) =>
              `[${SEVERITY_LABELS[f.severity]} · ${FINDING_KIND_LABELS[f.kind]} · ${FINDING_PLATFORM_LABELS[f.platform]}] ${f.text}`,
          ),
        ),
      );
    } else {
      lines.push(...list("Senaryolar", plan.scenarios));
    }
    if (round.rework_reason) lines.push(`**Revizyon nedeni:** ${round.rework_reason.summary}`, "");
  }
  return lines;
}

export function ideaToMarkdown({ idea, competitors, task, documents, repo, devReports, testRounds }: IdeaExport): string {
  const lines = ideaSection(idea);
  if (competitors && competitors.length > 0) lines.push(...competitorsSection(competitors));
  if (task) lines.push(...taskSection(task));
  if (documents && documents.length > 0) lines.push(...documentsSection(documents, repo));
  if (devReports && devReports.length > 0) lines.push(...devReportsSection(devReports));
  if (testRounds && testRounds.length > 0) lines.push(...testRoundsSection(testRounds));
  return `${lines.join("\n").trimEnd()}\n`;
}

// Yalnızca planlama belgeleri (geliştirme kartındaki "Tüm belgeler").
export function documentsToMarkdown(ideaName: string, documents: TaskDocument[], repo: RepoState | null | undefined) {
  return `${[`# ${ideaName}`, "", ...documentsSection(documents, repo)].join("\n").trimEnd()}\n`;
}

// Dosya adı: "MealMate" + "prd" → "mealmate-prd.md".
export function exportFileName(name: string, suffix?: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "fikir";
  return `${base}${suffix ? `-${suffix}` : ""}.md`;
}

export function downloadMarkdown(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
