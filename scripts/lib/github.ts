// build-skeleton.yml: iskelet reposu/issue işlemleri için GitHub REST API.
// SKELETON_REPO_PAT classic PAT (repo + project scope'ları, bkz. CLAUDE.md
// "PAT scope deviation"). Token yalnızca bu betiklerin çalıştığı adımlarda
// env'de durur — Claude Code adımına hiç verilmez.
const API = "https://api.github.com";

function token(): string {
  const value = process.env.SKELETON_REPO_PAT;
  if (!value) throw new Error("SKELETON_REPO_PAT env değişkeni tanımlı değil");
  return value;
}

export async function gh<T>(path: string, init: RequestInit = {}, allow404 = false): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "app-idea-factory-workflow",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub isteği başarısız: ${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface GhRepo {
  full_name: string;
  html_url: string;
  default_branch: string;
}

export interface GhIssue {
  number: number;
  html_url: string;
}

// https://github.com/owner/repo(/issues/12) → { owner, repo, issue? }
export function parseGithubUrl(url: string): { owner: string; repo: string; issue?: number } | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/issues\/(\d+))?\/?$/.exec(url);
  if (!match) return null;
  return { owner: match[1], repo: match[2], issue: match[3] ? Number(match[3]) : undefined };
}

export async function commentOnIssue(fullName: string, issueNumber: number, body: string): Promise<void> {
  await gh(`/repos/${fullName}/issues/${issueNumber}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}
