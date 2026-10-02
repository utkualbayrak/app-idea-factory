import type { Idea } from "@/lib/api";
import { ARCHIVE_AFTER_RUNS, ARCHIVE_SCORE_THRESHOLD, maintenanceScore } from "@/lib/scoring";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// "Arşive yaklaşıyor · 2/3": havuz bakımı bu fikrin bakım puanını art arda
// birkaç koşuda 7.00'ın altında buldu. Puan sınırın üstüne çıkarsa (ör.
// kullanıcı puanı verilirse) bir sonraki bakımda sayaç sıfırlanır.
export function StaleBadge({ idea }: { idea: Pick<Idea, "status" | "stale_runs" | "scores" | "user_rating"> }) {
  if (idea.status !== "new" || idea.stale_runs <= 0) return null;
  const score = maintenanceScore(idea.scores?.overall ?? null, idea.user_rating);
  const recovered = score != null && score >= ARCHIVE_SCORE_THRESHOLD;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={
            recovered
              ? "cursor-default text-muted-foreground"
              : "cursor-default border-amber-400 text-amber-700 dark:border-amber-800 dark:text-amber-300"
          }
        >
          Arşive yaklaşıyor · {idea.stale_runs}/{ARCHIVE_AFTER_RUNS}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {recovered
          ? `Bakım puanı artık ${score.toFixed(2)}; bir sonraki havuz bakımında sayaç sıfırlanacak.`
          : `Bakım puanı ${score?.toFixed(2) ?? "—"}, ${ARCHIVE_SCORE_THRESHOLD.toFixed(2)}'ın altında. ${ARCHIVE_AFTER_RUNS}. bakımda arşivlenir; kendi puanını verip ${ARCHIVE_SCORE_THRESHOLD.toFixed(2)} üstüne çıkarırsan sayaç sıfırlanır. Askıya alınan fikirler arşivlenmez.`}
      </TooltipContent>
    </Tooltip>
  );
}
