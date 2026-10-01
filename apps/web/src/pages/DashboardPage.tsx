import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchIdeas,
  fetchCronRuns,
  fetchWorkflowRuns,
  type Idea,
  type CronRun,
  type WorkflowRun,
} from "@/lib/api";
import { combinedScore } from "@/lib/scoring";
import { isInDevelopmentFlow, statusColorClasses, STATUS_LABELS } from "@/lib/idea-colors";
import { WORKFLOW_LABELS } from "@/lib/activity";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { CategoryBars } from "@/components/dashboard/CategoryBars";
import { ScoreTrendChart, type TrendPoint } from "@/components/dashboard/ScoreTrendChart";

const SOURCE_CHART_COLORS: Record<string, string> = {
  reddit: "var(--chart-1)",
  appstore: "var(--chart-2)",
  producthunt: "var(--chart-3)",
  hackernews: "var(--chart-4)",
};

const RUN_STATUS_LABELS: Record<CronRun["status"], string> = {
  running: "Çalışıyor",
  success: "Başarılı",
  failed: "Başarısız",
};

const JOB_STATUS: Record<WorkflowRun["status"], { label: string; className: string }> = {
  queued: { label: "Sırada", className: "bg-muted text-muted-foreground" },
  running: { label: "Çalışıyor", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  success: { label: "Başarılı", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  failed: { label: "Başarısız", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

const RANGES = [
  { value: "7", label: "Son 7 gün", days: 7 },
  { value: "30", label: "Son 30 gün", days: 30 },
  { value: "all", label: "Tümü", days: null },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

// Türkiye saatine göre bugünden (days - 1) gün önceki takvim günü, YYYY-MM-DD
// (batch_date ile string olarak karşılaştırılabilsin diye).
function rangeStart(days: number): string {
  const date = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(date);
}

export function DashboardPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [jobs, setJobs] = useState<WorkflowRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeValue>("30");

  useEffect(() => {
    Promise.all([fetchIdeas(), fetchCronRuns(5)])
      .then(([ideasRes, runsRes]) => {
        setIdeas(ideasRes.ideas);
        setRuns(runsRes.runs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // Fikir işleri ayrı yüklenir; başarısız olursa panelin geri kalanı etkilenmez.
    fetchWorkflowRuns({ limit: 5 })
      .then((res) => setJobs(res.runs))
      .catch(() => setJobs([]));
  }, []);

  // Anlık durum sayaçları (dönem seçiminden bağımsız).
  const metrics = useMemo(() => {
    if (!ideas) return null;
    const count = (pred: (i: Idea) => boolean) => ideas.filter(pred).length;
    return {
      total: ideas.length,
      fresh: count((i) => i.status === "new"),
      onHold: count((i) => i.status === "on_hold"),
      unrated: count((i) => (i.status === "new" || i.status === "on_hold") && i.user_rating == null),
      highScored: count((i) => (combinedScore(i.scores.overall, i.user_rating) ?? i.scores.overall) >= 8),
      inDevelopment: count((i) => i.status === "in_development"),
      developed: count((i) => i.status === "developed"),
    };
  }, [ideas]);

  // Seçili dönemdeki fikirler (batch_date'e göre) — aşağıdaki her şey bunu kullanır.
  const rangeIdeas = useMemo(() => {
    if (!ideas) return [];
    const days = RANGES.find((r) => r.value === range)?.days ?? null;
    if (days == null) return ideas;
    const start = rangeStart(days);
    return ideas.filter((i) => i.batch_date >= start);
  }, [ideas, range]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const idea of rangeIdeas) map.set(idea.category, (map.get(idea.category) ?? 0) + 1);
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [rangeIdeas]);

  const trendPoints = useMemo<TrendPoint[]>(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const idea of rangeIdeas) {
      const entry = map.get(idea.batch_date) ?? { sum: 0, count: 0 };
      entry.sum += idea.scores.overall;
      entry.count += 1;
      map.set(idea.batch_date, entry);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, { sum, count }]) => ({ date, average: sum / count, count }));
  }, [rangeIdeas]);

  const recentDevIdeas = useMemo(() => {
    if (!ideas) return [];
    return ideas
      .filter((i) => isInDevelopmentFlow(i.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5);
  }, [ideas]);

  const latestRun = runs?.[0] ?? null;
  const pieData = useMemo(() => {
    if (!latestRun?.source_breakdown) return [];
    return Object.entries(latestRun.source_breakdown).map(([source, value]) => ({
      label: source,
      value,
      color: SOURCE_CHART_COLORS[source] ?? "var(--chart-5)",
    }));
  }, [latestRun]);

  const header = <PageHeader title="Gösterge paneli" description="Fikirlerin ve günlük çalışmaların genel durumu." />;

  if (error)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage tone="error">Gösterge paneli yüklenemedi: {error}</PageMessage>
      </div>
    );
  if (!ideas || !metrics)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage>Yükleniyor…</PageMessage>
      </div>
    );

  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Şu an</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Toplam fikir" value={metrics.total} />
          <StatTile label="Yeni" value={metrics.fresh} to="/ideas" />
          <StatTile label="Askıda" value={metrics.onHold} to="/ideas" />
          <StatTile label="Puanlanmamış" value={metrics.unrated} to="/ideas" />
          <StatTile label="8.00+ puanlı" value={metrics.highScored} />
          <StatTile label="Geliştiriliyor" value={metrics.inDevelopment} to="/developed" />
          <StatTile label="Geliştirildi" value={metrics.developed} to="/developed" />
          <StatTile label="Son cron" value={latestRun ? RUN_STATUS_LABELS[latestRun.status] : "—"} to="/cron-runs" />
        </div>
      </section>

      {/* Dönem seçici: altındaki her şeyi (sayaç, kategori, trend) aynı dilime göre gösterir. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Dönem</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Dönem">
            {RANGES.map((r) => (
              <Button
                key={r.value}
                size="sm"
                variant={range === r.value ? "outline" : "ghost"}
                className={range === r.value ? "bg-background shadow-sm" : "text-muted-foreground"}
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">Kategori dağılımı</CardTitle>
              <p className="text-sm text-muted-foreground">
                {rangeLabel} içinde üretilen <span className="font-medium text-foreground">{rangeIdeas.length}</span> fikir
              </p>
            </CardHeader>
            <CardContent>
              <CategoryBars data={categoryData} />
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">Günlük ortalama Claude puanı</CardTitle>
              <p className="text-sm text-muted-foreground">Her günün fikirlerinin ortalama genel puanı (0-10)</p>
            </CardHeader>
            <CardContent>
              <ScoreTrendChart points={trendPoints} />
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Son fikir işleri</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {jobs == null ? (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz bir fikir işi çalıştırılmadı.</p>
            ) : (
              jobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/ideas/${job.idea_id}`}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.idea_name ?? "(silinmiş fikir)"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {WORKFLOW_LABELS[job.workflow] ?? job.workflow} · {formatDateTime(job.created_at)}
                    </span>
                  </span>
                  <Badge className={`shrink-0 ${JOB_STATUS[job.status].className}`}>{JOB_STATUS[job.status].label}</Badge>
                </Link>
              ))
            )}
            <Link to="/cron-runs?tab=jobs" className="w-fit text-sm text-primary underline underline-offset-4">
              Tüm fikir işleri
            </Link>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Son cron çalışması</CardTitle>
          </CardHeader>
          <CardContent>
            {!latestRun ? (
              <p className="text-sm text-muted-foreground">Henüz bir cron çalışması kaydedilmedi.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(latestRun.started_at)} — {RUN_STATUS_LABELS[latestRun.status]}
                </p>
                {pieData.length > 0 ? (
                  <PieChart data={pieData} />
                ) : (
                  <p className="text-sm text-muted-foreground">Kaynak dağılımı yok.</p>
                )}
                <Link to="/cron-runs" className="w-fit text-sm text-primary underline underline-offset-4">
                  Tüm geçmişi gör
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {recentDevIdeas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Son güncellenen geliştirme durumları</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recentDevIdeas.map((idea) => (
              <Link
                key={idea.id}
                to={`/ideas/${idea.id}`}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 truncate font-medium">{idea.name}</span>
                <Badge className={statusColorClasses(idea.status)}>
                  {STATUS_LABELS[idea.status]}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Sayaç kutusu: büyük sayı orantılı rakamlarla (tabular-nums değil), etiket
// altında; hedefi varsa ilgili ekrana link.
function StatTile({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const body = (
    <CardContent className="px-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </CardContent>
  );
  return to ? (
    <Link to={to} className="rounded-xl">
      <Card className="h-full py-4 transition-colors hover:bg-muted/50">{body}</Card>
    </Link>
  ) : (
    <Card className="h-full py-4">{body}</Card>
  );
}

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Veri yok.</p>;

  const stops = data.map((d, i) => {
    const before = data.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    const start = (before / total) * 360;
    const end = ((before + d.value) / total) * 360;
    return `${d.color} ${start}deg ${end}deg`;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="size-28 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      />
      <div className="flex flex-col gap-1.5 text-sm">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span>{d.label}</span>
            <span className="text-muted-foreground">({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
