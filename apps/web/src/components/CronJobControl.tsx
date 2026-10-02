import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { fetchCronRuns, triggerWorkflow, type CronRun, type CronRunKind, type DispatchableWorkflow } from "@/lib/api";
import { CRON_RUN_STALE_MS, isCronRunActive } from "@/lib/activity";
import { formatDateTime, formatDuration } from "@/lib/format-date";
import { RunError } from "@/components/RunError";
import { Button } from "@/components/ui/button";

const POLL_MS = 15_000;
const HISTORY_TAB: Record<CronRunKind, string> = { daily: "/cron-runs", merge: "/cron-runs?tab=maintenance" };

// Günlük üretim / havuz bakımı butonu: son koşunun durumunu gösterir, iş
// çalışırken butonu kilitler ve bitene kadar 15 sn'de bir yoklar. Kayıt
// tetikleme anında API'de açıldığı için "çalışıyor" hemen görünür.
export function CronJobControl({
  kind,
  workflow,
  label,
  icon,
  inputs,
  onFinished,
}: {
  kind: CronRunKind;
  workflow: DispatchableWorkflow;
  label: string;
  icon?: ReactNode;
  inputs?: Record<string, string>;
  /** Çalışan iş bitince (ör. Öneriler listesini tazelemek için). */
  onFinished?: () => void;
}) {
  const [run, setRun] = useState<CronRun | null | undefined>(undefined);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wasActive = useRef(false);

  const load = useCallback(() => {
    fetchCronRuns(1, kind)
      .then((res) => {
        setRun(res.runs[0] ?? null);
        setNow(Date.now());
      })
      .catch(() => setRun(null));
  }, [kind]);

  useEffect(load, [load]);

  const active = isCronRunActive(run ?? undefined, now);

  useEffect(() => {
    if (wasActive.current && !active) onFinished?.();
    wasActive.current = active;
  }, [active, onFinished]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  async function handleClick() {
    setTriggering(true);
    setError(null);
    try {
      await triggerWorkflow(workflow, inputs);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (!text.includes("HTTP 409")) setError(`Tetiklenemedi: ${text}`);
    } finally {
      setTriggering(false);
      load();
    }
  }

  const stuck = run?.status === "running" && !active;

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <Button variant="outline" className="w-fit" disabled={active || triggering || run === undefined} onClick={handleClick}>
        {active || triggering ? <Loader2 className="size-4 animate-spin" /> : icon}
        {active ? "Çalışıyor…" : triggering ? "Tetikleniyor…" : label}
      </Button>
      {run && (
        <p className="text-xs break-words text-muted-foreground sm:text-right">
          {active ? (
            <>Başladı: {formatDateTime(run.started_at)} · {formatDuration(run.started_at, new Date(now).toISOString())}</>
          ) : stuck ? (
            <span className="text-amber-700 dark:text-amber-300">
              {formatDateTime(run.started_at)}'de başlayan iş {CRON_RUN_STALE_MS / 60_000} dakikadır bitmedi, takılmış
              olabilir; tekrar çalıştırabilirsin.
            </span>
          ) : (
            <>
              Son çalışma: {formatDateTime(run.started_at)} —{" "}
              <span className={run.status === "failed" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}>
                {run.status === "failed" ? "başarısız" : "başarılı"}
              </span>
              {run.finished_at && ` (${formatDuration(run.started_at, run.finished_at)})`}
            </>
          )}
          {run.status === "failed" && run.error && (
            <span className="block text-destructive">
              <RunError error={run.error} />
            </span>
          )}
          {/* Başarısız koşuda log linki zaten hata satırında (RunError). */}
          <span className="block">
            {run.run_url && run.status !== "failed" && (
              <>
                <a href={run.run_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  log
                </a>
                {" · "}
              </>
            )}
            <Link to={HISTORY_TAB[kind]} className="underline underline-offset-4">
              geçmiş
            </Link>
          </span>
        </p>
      )}
      {error && <p className="text-xs text-destructive sm:text-right">{error}</p>}
    </div>
  );
}
