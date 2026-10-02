import { useState } from "react";
import { GitCommit, RefreshCw } from "lucide-react";
import { syncTaskRepo, type RepoChange, type RepoFile, type RepoState } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import { DiffView } from "@/components/DiffView";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CHANGE_LABELS: Record<RepoChange["change"], string> = {
  added: "Yeni",
  modified: "Değişti",
  removed: "Silindi",
};

const CHANGE_STYLES: Record<RepoChange["change"], string> = {
  added: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  modified: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  removed: "bg-muted text-muted-foreground",
};

// Faz 3 sonrası tur, Grup 2: "Repoyla senkronla" — son commit'ler ve son
// senkrondan beri değişen md dosyaları. docs/ altındaki dosyalar ayrıca
// Geliştirme kartının belge sekmelerinde görünür.
export function RepoSyncPanel({
  taskId,
  repo,
  onSynced,
}: {
  taskId: string;
  repo: RepoState | null;
  onSynced: (repo: RepoState) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sync = repo?.last_sync ?? null;

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await syncTaskRepo(taskId);
      onSynced(res.repo);
    } catch (err) {
      setError(`Senkronlanamadı: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  // Bir önceki senkronun HEAD'inden yeni olan commit'ler "yeni" işaretlenir.
  const previousIndex = sync?.previous_head_sha
    ? sync.commits.findIndex((c) => c.sha === sync.previous_head_sha)
    : -1;
  const newCommitCount = sync?.previous_head_sha ? (previousIndex === -1 ? sync.commits.length : previousIndex) : 0;
  const isInitial = sync != null && sync.previous_head_sha == null;

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Repo senkronu</p>
          <p className="text-xs text-muted-foreground">
            {sync
              ? `Son senkron: ${formatDateTime(sync.synced_at)}${sync.head_sha ? ` · ${sync.head_sha.slice(0, 7)}` : ""}`
              : "Henüz senkronlanmadı. Repodaki son commit'ler ve md dosyaları buraya çekilir."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Senkronlanıyor…" : "Repoyla senkronla"}
        </Button>
      </div>

      {error && <p className="text-sm break-words text-destructive">{error}</p>}

      {sync && (
        <>
          {sync.pending_count > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {sync.pending_count} değişmiş dosya daha var; kalanları almak için tekrar senkronla.
            </p>
          )}

          {isInitial ? (
            <p className="text-sm text-muted-foreground">
              İlk senkron: {repo?.files.length ?? 0} md dosyası alındı. Bundan sonraki senkronlarda değişiklikler burada
              listelenir.
            </p>
          ) : sync.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Önceki senkrondan beri md dosyalarında değişiklik yok.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Değişen md dosyaları ({sync.changes.length})
              </p>
              {sync.changes.map((change) => (
                <ChangeRow
                  key={change.path}
                  change={change}
                  file={repo?.files.find((f) => f.path === change.path)}
                />
              ))}
            </div>
          )}

          {sync.commits.length > 0 && (
            <details className="text-sm">
              <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
                Son commit'ler ({sync.commits.length}
                {newCommitCount > 0 ? `, ${newCommitCount} yeni` : ""})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {sync.commits.map((commit, i) => (
                  <li key={commit.sha} className="flex min-w-0 items-start gap-2">
                    <GitCommit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="break-words">
                        {i < newCommitCount && (
                          <Badge className="mr-1.5 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">yeni</Badge>
                        )}
                        {commit.message.split("\n")[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <a href={commit.url} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-2">
                          {commit.sha.slice(0, 7)}
                        </a>
                        {commit.author && ` · ${commit.author}`}
                        {commit.date && ` · ${formatDateTime(commit.date)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ChangeRow({ change, file }: { change: RepoChange; file: RepoFile | undefined }) {
  const header = (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Badge className={`shrink-0 ${CHANGE_STYLES[change.change]}`}>{CHANGE_LABELS[change.change]}</Badge>
      <span className="truncate font-mono text-xs">{change.path}</span>
    </span>
  );

  if (change.change === "removed" || !file) return <div className="flex min-w-0 py-0.5">{header}</div>;

  return (
    <details className="min-w-0">
      <summary className="flex min-w-0 cursor-pointer items-center py-0.5 hover:text-foreground">{header}</summary>
      <div className="mt-2 mb-1 min-w-0">
        {file.content == null ? (
          <p className="text-sm text-muted-foreground">Dosya çok büyük, içeriği çekilmedi — repoda görüntüle.</p>
        ) : change.change === "modified" && file.previous_content != null ? (
          <DiffView oldText={file.previous_content} newText={file.content} />
        ) : (
          <div className="max-h-[32rem] overflow-auto rounded-md border p-3">
            <Markdown>{file.content}</Markdown>
          </div>
        )}
      </div>
    </details>
  );
}
