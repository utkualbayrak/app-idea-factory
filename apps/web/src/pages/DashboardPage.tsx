import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchIdeas, fetchCronRuns, type Idea, type CronRun } from "@/lib/api";
import { combinedScore } from "@/lib/scoring";
import { statusColorClasses } from "@/lib/idea-colors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { formatDateTime } from "@/lib/format-date";

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

export function DashboardPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchIdeas(), fetchCronRuns(5)])
      .then(([ideasRes, runsRes]) => {
        setIdeas(ideasRes.ideas);
        setRuns(runsRes.runs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const metrics = useMemo(() => {
    if (!ideas) return null;
    const highScored = ideas.filter((i) => (combinedScore(i.scores.overall, i.user_rating) ?? i.scores.overall) >= 8).length;
    const inDevelopment = ideas.filter((i) => i.status === "in_development").length;
    const developed = ideas.filter((i) => i.status === "developed").length;
    return { highScored, inDevelopment, developed };
  }, [ideas]);

  const recentDevIdeas = useMemo(() => {
    if (!ideas) return [];
    return ideas
      .filter((i) => i.status === "in_development" || i.status === "developed")
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

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="8.00+ puanlı fikir" value={metrics.highScored} />
        <MetricCard label="Geliştiriliyor" value={metrics.inDevelopment} />
        <MetricCard label="Geliştirildi" value={metrics.developed} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Son cron çalışması</CardTitle>
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

      {recentDevIdeas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">
              Son güncellenen geliştirme durumları
            </CardTitle>
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
                  {idea.status === "developed" ? "Geliştirildi" : "Geliştiriliyor"}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
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
