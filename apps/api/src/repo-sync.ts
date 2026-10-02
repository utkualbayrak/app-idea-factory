import { toUtcIso } from "./db";

// Faz 3 sonrası tur, Grup 2: iskelet reposuyla senkron. Worker free planında
// istek başına 50 alt istek sınırı var: 2 çağrı (commit'ler + ağaç) +
// en fazla MAX_FETCHES dosya. Daha fazlası değiştiyse pending_count'a yazılır,
// bir sonraki senkron devam eder (çekilmeyenlerin sha'sı eski kaldığı için).
const MAX_FETCHES = 40;
const MAX_TRACKED_FILES = 150;
const MAX_FILE_BYTES = 200_000;
const COMMIT_COUNT = 30;
// Bağımlılık / derleme klasörlerindeki md'ler (paket README'leri vb.) gürültü.
const EXCLUDED_PATH = /(^|\/)(node_modules|Pods|build|dist|\.expo|\.dart_tool|vendor)\//;

export interface RepoCommit {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
}

export type RepoChange = { path: string; change: "added" | "modified" | "removed" };

export interface RepoSyncRow {
  id: string;
  task_id: string;
  synced_at: string;
  head_sha: string | null;
  previous_head_sha: string | null;
  commits: string;
  changes: string;
  pending_count: number;
}

export interface RepoFileRow {
  task_id: string;
  path: string;
  blob_sha: string;
  size: number;
  content: string | null;
  previous_content: string | null;
  first_seen_at: string;
  changed_at: string;
}

export function serializeRepoSync(row: RepoSyncRow) {
  return {
    synced_at: toUtcIso(row.synced_at),
    head_sha: row.head_sha,
    previous_head_sha: row.previous_head_sha,
    commits: JSON.parse(row.commits) as RepoCommit[],
    changes: JSON.parse(row.changes) as RepoChange[],
    pending_count: row.pending_count,
  };
}

export function serializeRepoFile(row: RepoFileRow) {
  return {
    path: row.path,
    size: row.size,
    content: row.content,
    previous_content: row.previous_content,
    first_seen_at: toUtcIso(row.first_seen_at),
    changed_at: toUtcIso(row.changed_at),
  };
}

export async function loadRepoState(db: D1Database, taskId: string) {
  const [sync, files] = await Promise.all([
    db
      .prepare("SELECT * FROM repo_syncs WHERE task_id = ?1 ORDER BY synced_at DESC LIMIT 1")
      .bind(taskId)
      .first<RepoSyncRow>(),
    db.prepare("SELECT * FROM repo_files WHERE task_id = ?1 ORDER BY path").bind(taskId).all<RepoFileRow>(),
  ]);
  return {
    last_sync: sync ? serializeRepoSync(sync) : null,
    files: files.results.map(serializeRepoFile),
  };
}

export class RepoSyncError extends Error {}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/.exec(url);
  return match ? { owner: match[1], repo: match[2] } : null;
}

async function github(token: string, path: string, accept = "application/vnd.github+json") {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "User-Agent": "app-idea-factory-worker",
    },
  });
  return res;
}

async function githubJson<T>(token: string, path: string): Promise<T> {
  const res = await github(token, path);
  if (res.status === 404) throw new RepoSyncError("Repo bulunamadı ya da token'ın bu repoya erişimi yok.");
  if (res.status === 409) throw new RepoSyncError("Repo boş, henüz commit yok.");
  if (!res.ok) throw new RepoSyncError(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function syncRepo(db: D1Database, token: string, taskId: string, repoUrl: string) {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new RepoSyncError(`Repo adresi anlaşılamadı: ${repoUrl}`);
  const base = `/repos/${parsed.owner}/${parsed.repo}`;

  const commitsRaw = await githubJson<
    { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null } }[]
  >(token, `${base}/commits?per_page=${COMMIT_COUNT}`);
  const commits: RepoCommit[] = commitsRaw.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? null,
    date: c.commit.author?.date ?? null,
    url: c.html_url,
  }));
  const headSha = commits[0]?.sha ?? null;
  if (!headSha) throw new RepoSyncError("Repo boş, henüz commit yok.");

  const tree = await githubJson<{ tree: { path: string; type: string; sha: string; size?: number }[] }>(
    token,
    `${base}/git/trees/${headSha}?recursive=1`,
  );
  const mdEntries = tree.tree
    .filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith(".md") && !EXCLUDED_PATH.test(e.path))
    .slice(0, MAX_TRACKED_FILES);

  const existing = await db
    .prepare("SELECT path, blob_sha FROM repo_files WHERE task_id = ?1")
    .bind(taskId)
    .all<{ path: string; blob_sha: string }>();
  const existingSha = new Map(existing.results.map((r) => [r.path, r.blob_sha]));

  const changed = mdEntries.filter((e) => existingSha.get(e.path) !== e.sha);
  const fetchNow = changed.slice(0, MAX_FETCHES);
  const pendingCount = changed.length - fetchNow.length;
  const treePaths = new Set(mdEntries.map((e) => e.path));
  const removed = [...existingSha.keys()].filter((p) => !treePaths.has(p));

  const fetched = await Promise.all(
    fetchNow.map(async (entry) => {
      const size = entry.size ?? 0;
      if (size > MAX_FILE_BYTES) return { entry, content: null };
      const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const res = await github(token, `${base}/contents/${encodedPath}?ref=${headSha}`, "application/vnd.github.raw+json");
      if (!res.ok) throw new RepoSyncError(`${entry.path} çekilemedi (GitHub ${res.status}).`);
      return { entry, content: await res.text() };
    }),
  );

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const changes: RepoChange[] = [];

  for (const { entry, content } of fetched) {
    const isNew = !existingSha.has(entry.path);
    changes.push({ path: entry.path, change: isNew ? "added" : "modified" });
    statements.push(
      db
        .prepare(
          `INSERT INTO repo_files (task_id, path, blob_sha, size, content, previous_content, first_seen_at, changed_at)
           VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6)
           ON CONFLICT (task_id, path) DO UPDATE SET
             blob_sha = excluded.blob_sha, size = excluded.size,
             previous_content = repo_files.content, content = excluded.content,
             changed_at = excluded.changed_at`,
        )
        .bind(taskId, entry.path, entry.sha, entry.size ?? 0, content, now),
    );
  }
  for (const path of removed) {
    changes.push({ path, change: "removed" });
    statements.push(db.prepare("DELETE FROM repo_files WHERE task_id = ?1 AND path = ?2").bind(taskId, path));
  }

  const previous = await db
    .prepare("SELECT head_sha FROM repo_syncs WHERE task_id = ?1 ORDER BY synced_at DESC LIMIT 1")
    .bind(taskId)
    .first<{ head_sha: string | null }>();

  statements.push(
    db
      .prepare(
        `INSERT INTO repo_syncs (id, task_id, synced_at, head_sha, previous_head_sha, commits, changes, pending_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        crypto.randomUUID(),
        taskId,
        now,
        headSha,
        previous?.head_sha ?? null,
        JSON.stringify(commits),
        JSON.stringify(changes.sort((a, b) => a.path.localeCompare(b.path))),
        pendingCount,
      ),
  );

  await db.batch(statements);
}
