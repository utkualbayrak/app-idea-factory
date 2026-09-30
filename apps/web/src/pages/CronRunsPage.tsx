import { useEffect, useState } from "react";
import { fetchCronRuns, fetchTrendSnapshots, type CronRun, type TrendSnapshot } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_STYLES: Record<CronRun["status"], string> = {
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const STATUS_LABELS: Record<CronRun["status"], string> = {
  running: "Çalışıyor",
  success: "Başarılı",
  failed: "Başarısız",
};

interface SnapshotItem {
  title: string;
  summary?: string;
  url: string;
}

interface SnapshotPayload {
  label?: string;
  items?: SnapshotItem[];
  error?: string;
}

export function CronRunsPage() {
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [snapshotsByRun, setSnapshotsByRun] = useState<Record<string, TrendSnapshot[]>>({});

  useEffect(() => {
    fetchCronRuns()
      .then((res) => setRuns(res.runs))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  function toggleExpand(runId: string) {
    const next = expandedRunId === runId ? null : runId;
    setExpandedRunId(next);
    if (next && !snapshotsByRun[next]) {
      fetchTrendSnapshots(next)
        .then((res) => setSnapshotsByRun((prev) => ({ ...prev, [next]: res.snapshots })))
        .catch(() => setSnapshotsByRun((prev) => ({ ...prev, [next]: [] })));
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">Cron geçmişi yüklenemedi: {error}</p>;
  if (!runs) return <p className="py-10 text-center text-muted-foreground">Yükleniyor…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Cron geçmişi</h1>

      {runs.length === 0 && <p className="py-10 text-center text-muted-foreground">Henüz kayıtlı bir çalışma yok.</p>}

      <div className="flex flex-col gap-3">
        {runs.map((run) => {
          const expanded = expandedRunId === run.id;
          const snapshots = snapshotsByRun[run.id];

          return (
            <Card key={run.id} className="min-w-0">
              <CardContent className="flex flex-col gap-2 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={STATUS_STYLES[run.status]}>{STATUS_LABELS[run.status]}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(run.started_at).toLocaleString("tr-TR")}
                    {run.finished_at && ` — ${new Date(run.finished_at).toLocaleString("tr-TR")}`}
                  </span>
                </div>

                {run.source_breakdown && (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {Object.entries(run.source_breakdown).map(([source, count]) => (
                      <span key={source}>
                        {source}: <span className="font-medium text-foreground">{count}</span>
                      </span>
                    ))}
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => toggleExpand(run.id)}>
                      {expanded ? "Kaynak detaylarını gizle" : "Kaynak detaylarını gör"}
                    </Button>
                  </div>
                )}

                {run.error && (
                  <p className="text-sm break-words text-destructive">
                    {run.error.startsWith("http") ? (
                      <a href={run.error} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        Çalışma loglarını gör
                      </a>
                    ) : (
                      run.error
                    )}
                  </p>
                )}

                {expanded && (
                  <div className="mt-2 flex flex-col gap-3 border-t pt-3">
                    {!snapshots ? (
                      <p className="text-sm text-muted-foreground">Yükleniyor…</p>
                    ) : snapshots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Bu çalışma için kayıtlı kaynak detayı yok.</p>
                    ) : (
                      snapshots.map((snapshot) => {
                        const payload = snapshot.payload as SnapshotPayload;
                        return (
                          <div key={snapshot.id} className="min-w-0">
                            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                              {payload.label ?? snapshot.source}
                              {payload.error && <span className="text-destructive"> (uyarı: {payload.error})</span>}
                            </div>
                            <ul className="mt-1 flex flex-col gap-1">
                              {(payload.items ?? []).map((item) => (
                                <li key={item.url} className="min-w-0 truncate text-sm">
                                  <a href={item.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                                    {item.title}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
