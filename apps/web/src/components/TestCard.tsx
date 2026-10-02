import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, FlaskConical, Undo2 } from "lucide-react";
import { cancelTestRound, type IdeaStatus, type TestFinding, type TestRound } from "@/lib/api";
import {
  FINDING_KIND_LABELS,
  FINDING_PLATFORM_LABELS,
  ROUND_STATUS_LABELS,
  ROUND_STATUS_STYLES,
  SCENARIO_RESULT_LABELS,
  SCENARIO_RESULT_STYLES,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  TEST_CHANNEL_LABELS,
  TEST_PLATFORM_LABELS,
} from "@/lib/test-labels";
import { addDaysIso, daysBetweenIso, formatBatchDate, formatDateTime, todayIso } from "@/lib/format-date";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Fikir detayında test süreci: başlat / sonuç gir / iptal ve geçmiş turlar.
export function TestCard({
  ideaId,
  ideaStatus,
  rounds,
  onChanged,
}: {
  ideaId: string;
  ideaStatus: IdeaStatus;
  rounds: TestRound[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const running = rounds.find((r) => r.status === "running") ?? null;
  const history = rounds.filter((r) => r.status !== "running");

  if (ideaStatus !== "awaiting_test" && !running && rounds.length === 0) return null;

  async function handleCancel() {
    if (!running) return;
    setError(null);
    try {
      await cancelTestRound(running.id);
      onChanged();
    } catch (err) {
      setError(`İptal edilemedi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card id="test" className="min-w-0 scroll-mt-44">
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Test</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {ideaStatus === "awaiting_test" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Geliştirme tamamlandı. Kaç kişiyle, kaç gün ve neyin deneneceğini belirleyip testi başlat.
            </p>
            <Button asChild className="w-fit">
              <Link to={`/ideas/${ideaId}/test/start`}>
                <FlaskConical className="size-4" />
                Testi başlat
              </Link>
            </Button>
          </div>
        )}

        {running && (
          <div className="flex flex-col gap-3">
            <RoundBlock round={running} />
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/ideas/${ideaId}/test/result`}>
                  <ClipboardCheck className="size-4" />
                  Sonuçları gir
                </Link>
              </Button>
              <ConfirmButton
                label={
                  <>
                    <Undo2 className="size-4" />
                    Testi iptal et
                  </>
                }
                title="Test turunu iptal et?"
                description='Tur "İptal edildi" olarak geçmişte kalır, fikir tekrar "Test bekliyor" olur ve yeni bir test başlatabilirsin.'
                confirmLabel="İptal et"
                onConfirm={handleCancel}
              />
            </div>
            {error && <p className="text-sm break-words text-destructive">{error}</p>}
          </div>
        )}

        {history.length > 0 && (
          <div className="flex flex-col gap-3">
            {(running || ideaStatus === "awaiting_test") && (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Önceki turlar</p>
            )}
            {history.map((round) => (
              <RoundBlock key={round.id} round={round} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoundBlock({ round }: { round: TestRound }) {
  const { plan, result } = round;
  const plannedEnd = addDaysIso(plan.start_date, plan.duration_days - 1);
  const elapsed = Math.min(plan.duration_days, Math.max(0, daysBetweenIso(plan.start_date, todayIso()) + 1));

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{round.round}. tur</span>
          <Badge className={ROUND_STATUS_STYLES[round.status]}>{ROUND_STATUS_LABELS[round.status]}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {round.finished_at ? `Kapandı ${formatDateTime(round.finished_at)}` : `Açıldı ${formatDateTime(round.created_at)}`}
        </span>
      </div>

      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Plan</dt>
        <dd>
          {plan.tester_count} kişi × {plan.duration_days} gün · {formatBatchDate(plan.start_date)} –{" "}
          {formatBatchDate(plannedEnd)}
          {round.status === "running" && ` · ${elapsed}. gün`}
        </dd>
        <dt className="text-muted-foreground">Platform</dt>
        <dd>
          {plan.platforms.map((p) => TEST_PLATFORM_LABELS[p]).join(", ")} · {TEST_CHANNEL_LABELS[plan.channel]}
        </dd>
        {result && (
          <>
            <dt className="text-muted-foreground">Gerçekleşen</dt>
            <dd>
              {result.actual_tester_count} kişi × {result.actual_days} gün
              {result.satisfaction != null && ` · memnuniyet ${result.satisfaction.toFixed(2)}/10`}
            </dd>
          </>
        )}
      </dl>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Senaryolar</p>
        <ul className="mt-1 flex flex-col gap-1">
          {plan.scenarios.map((scenario, i) => {
            const r = result?.scenario_results[i]?.result;
            return (
              <li key={i} className="flex min-w-0 items-start gap-2">
                {r && <Badge className={`shrink-0 ${SCENARIO_RESULT_STYLES[r]}`}>{SCENARIO_RESULT_LABELS[r]}</Badge>}
                <span className="min-w-0 break-words">{scenario}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {plan.success_criteria.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Başarı kriterleri</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {plan.success_criteria.map((c, i) => (
              <li key={i} className="break-words">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.findings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Bulgular ({result.findings.length})</p>
          <FindingList findings={result.findings} showPlatform={plan.platforms.length > 1} />
        </div>
      )}
      {result && result.findings.length === 0 && <p className="text-xs text-muted-foreground">Bulgu girilmedi.</p>}

      {round.rework_reason && (
        <p className="rounded-md bg-rose-50 px-3 py-2 break-words text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          <span className="font-medium">Geri gönderme sebebi:</span> {round.rework_reason.summary}
        </p>
      )}
    </div>
  );
}

function FindingList({ findings, showPlatform }: { findings: TestFinding[]; showPlatform: boolean }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {findings.map((finding, i) => (
        <li key={i} className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge className={SEVERITY_STYLES[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
          <span className="text-xs text-muted-foreground">
            {FINDING_KIND_LABELS[finding.kind]}
            {showPlatform && ` · ${FINDING_PLATFORM_LABELS[finding.platform]}`}
          </span>
          <span className="min-w-0 break-words">{finding.text}</span>
        </li>
      ))}
    </ul>
  );
}

// "Revizyonda" fikirlerin detayında (ve Geliştirildi formunda) en üstte:
// son testten neden geri döndüğü ve ele alınacak bulgular.
export function ReworkBanner({ rounds }: { rounds: TestRound[] }) {
  const round = rounds.find((r) => r.status === "rework");
  if (!round?.rework_reason || !round.result) return null;
  const selected = round.rework_reason.finding_indexes
    .map((i) => round.result?.findings[i])
    .filter((f): f is TestFinding => f != null);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
      <p className="font-medium">
        Testten geri döndü · {round.round}. tur{round.finished_at ? ` · ${formatDateTime(round.finished_at)}` : ""}
      </p>
      <p className="break-words">{round.rework_reason.summary}</p>
      {selected.length > 0 && (
        <div>
          <p className="text-xs font-medium opacity-80">Ele alınacak bulgular</p>
          <FindingList findings={selected} showPlatform={round.plan.platforms.length > 1} />
        </div>
      )}
    </div>
  );
}
