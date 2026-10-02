import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchCronRuns,
  fetchTrendSnapshots,
  fetchWorkflowRuns,
  type CronRun,
  type CronRunKind,
  type TrendSnapshot,
  type WorkflowRun,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { formatDateTime, formatDuration } from "@/lib/format-date";
import { WORKFLOW_LABELS } from "@/lib/activity";
import { RunError } from "@/components/RunError";

type RunStatus = WorkflowRun["status"];

const STATUS_STYLES: Record<RunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const STATUS_LABELS: Record<RunStatus, string> = {
  queued: "Sırada",
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

// Her sekmenin üstündeki özet şeridi: toplam / başarılı / başarısız / devam eden.
function SummaryStrip({ statuses }: { statuses: RunStatus[] }) {
  const count = (...wanted: RunStatus[]) => statuses.filter((s) => wanted.includes(s)).length;
  const items = [
    { label: "Toplam", value: statuses.length, className: "text-foreground" },
    { label: "Başarılı", value: count("success"), className: "text-emerald-700 dark:text-emerald-300" },
    { label: "Başarısız", value: count("failed"), className: "text-red-700 dark:text-red-300" },
    { label: "Devam eden", value: count("queued", "running"), className: "text-sky-700 dark:text-sky-300" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="py-4">
          <CardContent className="px-4">
            <div className={`text-2xl font-semibold tabular-nums ${item.className}`}>{item.value}</div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const TABS = ["daily", "jobs", "maintenance"] as const;
type TabValue = (typeof TABS)[number];

// "Çalışma geçmişi": günlük fikir üretimi (cron_runs) + fikir bazlı arka plan
// işleri (workflow_runs). Seçili sekme ?tab= ile URL'de tutulur ki gösterge
// panelinden doğrudan "Fikir işleri"ne link verilebilsin.
export function CronRunsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabValue = TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : "daily";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Çalışma geçmişi"
        description="Günlük fikir üretimi, fikir bazlı arka plan işleri ve havuz bakımı, en yenisi en üstte."
      />
      <Tabs value={tab} onValueChange={(v) => setSearchParams(v === "daily" ? {} : { tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="daily">Günlük fikir üretimi</TabsTrigger>
          <TabsTrigger value="jobs">Fikir işleri</TabsTrigger>
          <TabsTrigger value="maintenance">Havuz bakımı</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          <DailyRunsTab kind="daily" />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          <DailyRunsTab kind="merge" />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <IdeaJobsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IdeaJobsTab() {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchWorkflowRuns({ limit: 200 })
      .then((res) => setRuns(res.runs))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!runs || !query) return runs ?? [];
    return runs.filter((run) => (run.idea_name ?? "").toLowerCase().includes(query));
  }, [runs, search]);

  if (error) return <PageMessage tone="error">Fikir işleri yüklenemedi: {error}</PageMessage>;
  if (!runs) return <PageMessage>Yükleniyor…</PageMessage>;

  return (
    <div className="flex flex-col gap-4">
      <SummaryStrip statuses={runs.map((r) => r.status)} />

      <Input
        placeholder="Fikir adına göre ara…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sm:max-w-xs"
      />

      {runs.length === 0 && (
        <PageMessage>Henüz bir fikir işi çalıştırılmadı (yeniden değerlendirme, rakip bulma).</PageMessage>
      )}
      {runs.length > 0 && filtered.length === 0 && <PageMessage>Bu ada uyan iş yok.</PageMessage>}

      <div className="flex flex-col gap-3">
        {filtered.map((run) => (
          <Card key={run.id} className="min-w-0">
            <CardContent className="flex flex-col gap-2 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={STATUS_STYLES[run.status]}>{STATUS_LABELS[run.status]}</Badge>
                <span className="font-medium">{WORKFLOW_LABELS[run.workflow] ?? run.workflow}</span>
                <span className="text-muted-foreground">·</span>
                <Link to={`/ideas/${run.idea_id}`} className="min-w-0 truncate text-primary underline underline-offset-4">
                  {run.idea_name ?? "(silinmiş fikir)"}
                </Link>
              </div>
              <div className="text-sm text-muted-foreground">
                Tetiklendi: {formatDateTime(run.created_at)}
                {run.finished_at && ` — bitti: ${formatDateTime(run.finished_at)}`}
                {run.finished_at && (
                  <span className="ml-2 text-foreground">
                    Süre: {formatDuration(run.started_at ?? run.created_at, run.finished_at)}
                  </span>
                )}
              </div>
              {(run.error || run.run_url) && (
                <p className="text-sm break-words">
                  {run.error && <span className="text-destructive">{run.error}</span>}
                  {run.error && run.run_url && " — "}
                  {run.run_url && (
                    <a href={run.run_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                      Çalışma loglarını gör
                    </a>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Havuz bakımı koşusunun özetindeki sayılar (submit-proposals.ts).
const SUMMARY_LABELS: Record<string, string> = {
  merges_applied: "Otomatik birleştirme",
  merges_pending: "Onay bekleyen birleştirme",
  features: "Özellik önerisi",
  skipped: "Atlanan öneri",
  archived: "Arşivlenen",
  purged: "Kalıcı silinen",
};

// Günlük fikir üretimi ve havuz bakımı aynı cron_runs kaydını kullanır.
function DailyRunsTab({ kind }: { kind: CronRunKind }) {
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [snapshotsByRun, setSnapshotsByRun] = useState<Record<string, TrendSnapshot[]>>({});

  useEffect(() => {
    fetchCronRuns(30, kind)
      .then((res) => setRuns(res.runs))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [kind]);

  function toggleExpand(runId: string) {
    const next = expandedRunId === runId ? null : runId;
    setExpandedRunId(next);
    if (next && !snapshotsByRun[next]) {
      fetchTrendSnapshots(next)
        .then((res) => setSnapshotsByRun((prev) => ({ ...prev, [next]: res.snapshots })))
        .catch(() => setSnapshotsByRun((prev) => ({ ...prev, [next]: [] })));
    }
  }

  if (error) return <PageMessage tone="error">Cron geçmişi yüklenemedi: {error}</PageMessage>;
  if (!runs) return <PageMessage>Yükleniyor…</PageMessage>;

  return (
    <div className="flex flex-col gap-4">
      <SummaryStrip statuses={runs.map((r) => r.status)} />

      {runs.length === 0 && (
        <PageMessage>
          {kind === "merge"
            ? "Henüz havuz bakımı çalışmadı. Ayarlar'dan elle başlatabilirsin."
            : "Henüz kayıtlı bir çalışma yok."}
        </PageMessage>
      )}

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
                    {formatDateTime(run.started_at)}
                    {run.finished_at && ` — ${formatDateTime(run.finished_at)}`}
                    {run.finished_at && (
                      <span className="ml-2 text-foreground">Süre: {formatDuration(run.started_at, run.finished_at)}</span>
                    )}
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

                {run.summary && (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {Object.entries(run.summary).map(([key, count]) => (
                      <span key={key}>
                        {SUMMARY_LABELS[key] ?? key}: <span className="font-medium text-foreground">{count}</span>
                      </span>
                    ))}
                    {(run.summary.merges_pending > 0 || run.summary.features > 0) && (
                      <Link to="/proposals" className="text-primary underline underline-offset-4">
                        Önerilere git
                      </Link>
                    )}
                  </div>
                )}

                {run.error && (
                  <p className="text-sm break-words text-destructive">
                    <RunError error={run.error} />
                  </p>
                )}
                {run.run_url && !run.error && (
                  <a href={run.run_url} target="_blank" rel="noreferrer" className="w-fit text-sm underline underline-offset-4">
                    Çalışma loglarını gör
                  </a>
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
