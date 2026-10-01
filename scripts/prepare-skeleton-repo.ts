import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { reportTaskBuild } from "./lib/api-client";
import { gh, parseGithubUrl, type GhIssue, type GhRepo } from "./lib/github";
import { taskParamsSchema, PLAN_DOCUMENT_FILES } from "./lib/task-schema";

// Kullanım: tsx prepare-skeleton-repo.ts <idea id> <output dir>
// build-skeleton.yml: iskelet reposunu ve issue'sunu hazırlar.
// - Görevde repo_url varsa (tekrar deneme) o repo kullanılır; yoksa ya da
//   repo silinmişse fikrin adından türetilen yeni bir özel repo açılır
//   (mealmate-app; çakışırsa mealmate-app-2, -3 ...).
// - issue_url varsa o issue'ya yeni deneme yorumu düşülür; yoksa issue açılır.
// - Adresler hemen API'ye bildirilir ki iş sonradan patlasa da tekrar deneme
//   aynı repoyu bulsun.
// Sonuçlar $GITHUB_ENV'e yazılır: SKELETON_REPO (owner/name), SKELETON_ISSUE_NUMBER,
// SKELETON_PLATFORM, SKELETON_NAME.
interface IdeaFile {
  name: string;
  one_liner: string;
  problem: string;
  target_audience: string;
}

interface TaskFile {
  repo_url: string | null;
  issue_url: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  expo: "Çapraz platform — React Native / Expo",
  flutter: "Çapraz platform — Flutter",
  ios_swift: "iOS — Swift",
  android_kotlin: "Android — Kotlin",
};

function repoSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "idea"}-app`;
}

async function findFreeRepoName(owner: string, base: string): Promise<string> {
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const existing = await gh<GhRepo>(`/repos/${owner}/${candidate}`, {}, true);
    if (!existing) return candidate;
  }
  throw new Error(`${base} için boş repo adı bulunamadı`);
}

async function main() {
  const [ideaId, outDir] = process.argv.slice(2);
  if (!ideaId || !outDir) throw new Error("Kullanım: prepare-skeleton-repo.ts <idea id> <output dir>");
  const runUrl = process.env.RUN_URL ?? "";

  const idea = JSON.parse(await readFile(path.join(outDir, "idea.json"), "utf-8")) as IdeaFile;
  const task = JSON.parse(await readFile(path.join(outDir, "task.json"), "utf-8")) as TaskFile;
  const params = taskParamsSchema.parse(JSON.parse(await readFile(path.join(outDir, "task-params.json"), "utf-8")));

  const user = await gh<{ login: string }>("/user");
  if (!user) throw new Error("GitHub kullanıcısı okunamadı");

  // 1) Repo: tekrar denemede kayıtlı repo, yoksa yeni özel repo.
  let repo: GhRepo | null = null;
  const stored = task.repo_url ? parseGithubUrl(task.repo_url) : null;
  if (stored) {
    repo = await gh<GhRepo>(`/repos/${stored.owner}/${stored.repo}`, {}, true);
    if (repo) console.log(`Mevcut repo kullanılıyor: ${repo.full_name}`);
    else console.log(`Kayıtlı repo (${task.repo_url}) bulunamadı — yenisi açılacak.`);
  }
  if (!repo) {
    const name = await findFreeRepoName(user.login, repoSlug(idea.name));
    repo = await gh<GhRepo>("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        private: true,
        description: idea.one_liner.slice(0, 350),
        // İlk commit + varsayılan dal olsun ki workflow doğrudan clone edebilsin.
        auto_init: true,
        has_wiki: false,
      }),
    });
    if (!repo) throw new Error("Repo oluşturulamadı");
    console.log(`Yeni özel repo açıldı: ${repo.full_name}`);
  }

  // 2) Issue: tekrar denemede aynı issue (aynı repodaysa), yoksa yeni.
  let issue: GhIssue | null = null;
  const storedIssue = task.issue_url ? parseGithubUrl(task.issue_url) : null;
  if (storedIssue?.issue && `${storedIssue.owner}/${storedIssue.repo}` === repo.full_name) {
    issue = await gh<GhIssue>(`/repos/${repo.full_name}/issues/${storedIssue.issue}`, {}, true);
  }
  if (issue) {
    await gh(`/repos/${repo.full_name}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: `🔁 İskelet üretimi yeniden deneniyor (aynı belgelerle).\n\nÇalışma: ${runUrl}` }),
    });
  } else {
    const docList = Object.values(PLAN_DOCUMENT_FILES)
      .map((file) => `- [\`docs/${file}\`](docs/${file})`)
      .join("\n");
    const body = [
      `**${idea.one_liner}**`,
      "",
      "## Problem",
      idea.problem,
      "",
      "## Hedef kitle",
      idea.target_audience,
      "",
      "## Görev formu (ilk seçimler)",
      "_Planlama belgeleri onaydan önce düzenlenmiş olabilir; kapsam ve kararlar için belgeler geçerlidir._",
      "",
      `- Platform: ${PLATFORM_LABELS[params.platform] ?? params.platform}`,
      `- Backend: ${params.backend}`,
      `- Kimlik doğrulama: ${params.auth}`,
      `- Tasarım: ${params.design.theme} · ${params.design.style}`,
      "- MVP özellikleri:",
      ...params.mvp_features.map((f) => `  - ${f}`),
      ...(params.notes ? ["", "**Notlar:**", params.notes] : []),
      "",
      "## Planlama belgeleri",
      docList,
      "",
      "Fikrin tam hali: [`IDEA.md`](IDEA.md)",
      "",
      `İskeleti kuran çalışma: ${runUrl}`,
    ].join("\n");
    issue = await gh<GhIssue>(`/repos/${repo.full_name}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: `İskelet: ${idea.name}`, body }),
    });
    if (!issue) throw new Error("Issue açılamadı");
    console.log(`Issue açıldı: ${issue.html_url}`);
  }

  await reportTaskBuild({ idea_id: ideaId, repo_url: repo.html_url, issue_url: issue.html_url });

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    // İsim yalnızca commit mesajında kullanılıyor; satır sonu env dosyasını bozmasın.
    const safeName = idea.name.replace(/[\r\n]/g, " ");
    await appendFile(
      githubEnv,
      `SKELETON_REPO=${repo.full_name}\nSKELETON_ISSUE_NUMBER=${issue.number}\nSKELETON_PLATFORM=${params.platform}\nSKELETON_NAME=${safeName}\n`,
      "utf-8",
    );
  }
}

main().catch(async (err) => {
  console.error(err);
  await writeFile(
    path.join("output", "failure-reason.txt"),
    `Repo/issue hazırlanamadı: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`,
    "utf-8",
  ).catch(() => {});
  process.exit(1);
});
