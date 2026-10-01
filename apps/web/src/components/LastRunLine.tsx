import type { WorkflowRun } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";

const RUN_STATUS_LABELS: Record<WorkflowRun["status"], string> = {
  queued: "sırada",
  running: "çalışıyor",
  success: "başarılı",
  failed: "başarısız",
};

// Bu fikir için o türdeki en son arka plan işinin kısa özeti + log linki.
export function LastRunLine({ run, label }: { run: WorkflowRun | undefined; label: string }) {
  if (!run) return null;
  return (
    <p className="text-xs break-words text-muted-foreground">
      {label}: {formatDateTime(run.created_at)} — {RUN_STATUS_LABELS[run.status]}
      {run.status === "failed" && run.error && ` (${run.error})`}
      {run.run_url && (
        <>
          {" · "}
          <a href={run.run_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            log
          </a>
        </>
      )}
    </p>
  );
}
