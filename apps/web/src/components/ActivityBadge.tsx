import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/format-date";
import {
  ACTIVITY_LABELS,
  FAILED_KINDS,
  IN_PROGRESS_KINDS,
  STALE_AFTER_MS,
  STUCK_AFTER_MS,
  SUCCESS_KINDS,
  isActivityUnread,
  type ActivityIdea,
} from "@/lib/activity";
import { cn } from "@/lib/utils";
import type { IdeaStatus } from "@/lib/api";
import { COMMIT_DATE_STATUSES } from "@/lib/idea-colors";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STYLES = {
  progress: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  neutral: "",
};

// Fikir listesinde durumun yanında "ne olup bitti" rozeti (2. tur Grup C):
// - hiç kaybolmaz, her zaman son aktiviteyi gösterir (tarih tooltip'te),
// - okunmamışsa nokta ile vurgulanır (detay açılınca kalkar),
// - 7 günden eskiyse soluk gösterilir.
export function ActivityBadge({
  idea,
  className,
}: {
  idea: ActivityIdea & { status?: IdeaStatus };
  className?: string;
}) {
  // Render başına sabit "şimdi" (lazy init — render sırasında Date.now() çağırmamak için).
  const [now] = useState(() => Date.now());
  const { last_activity_at: at, last_activity_kind: kind } = idea;
  if (!at || !kind) return null;
  // Üzerinde çalışılan fikirde "İskelet hazır" görüldükten sonra bayat bilgi:
  // durum rozeti zaten "Geliştiriliyor · son commit tarihi" gösteriyor.
  if (
    kind === "skeleton_built" &&
    idea.status &&
    COMMIT_DATE_STATUSES.includes(idea.status) &&
    !isActivityUnread(idea, now)
  )
    return null;

  const age = now - new Date(at).getTime();
  const inProgress = IN_PROGRESS_KINDS.includes(kind);
  const stuck = inProgress && age > STUCK_AFTER_MS;
  const stale = age > STALE_AFTER_MS;
  const unread = isActivityUnread(idea, now);

  const tone = inProgress
    ? "progress"
    : SUCCESS_KINDS.includes(kind)
      ? "success"
      : FAILED_KINDS.includes(kind)
        ? "failed"
        : "neutral";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={tone === "neutral" ? "outline" : "default"}
          className={cn(
            "max-w-full cursor-default gap-1 truncate",
            STYLES[tone],
            (stale || stuck) && "opacity-60",
            unread && "ring-2 ring-primary/40",
            className,
          )}
        >
          {unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="okunmamış" />}
          {inProgress && !stuck && <Loader2 className="size-3 shrink-0 animate-spin" />}
          <span className="truncate">{ACTIVITY_LABELS[kind]}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {formatDateTime(at)}
        {stuck && " — 1 saattir sonuç gelmedi, Çalışma geçmişine bak"}
        {unread && " — henüz görülmedi"}
      </TooltipContent>
    </Tooltip>
  );
}
