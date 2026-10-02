import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchLastCommit, type Idea, type RepoCommit } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { COMMIT_DATE_STATUSES, statusColorClasses, STATUS_LABELS } from "@/lib/idea-colors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// İskeleti kurulmuş ve üzerinde çalışılan fikirlerde (COMMIT_DATE_STATUSES)
// durum rozeti son commit tarihini de gösterir ("Geliştiriliyor · 13.10.2026").
// Tarih her mount'ta repodan çekilir; beklerken yalnızca bu rozet yükleniyor görünür.

export function IdeaStatusBadge({ idea, className }: { idea: Pick<Idea, "id" | "status">; className?: string }) {
  const withCommit = COMMIT_DATE_STATUSES.includes(idea.status);
  const label = STATUS_LABELS[idea.status];
  const classes = cn(statusColorClasses(idea.status), "gap-1", className);

  if (!withCommit) return <Badge className={classes}>{label}</Badge>;
  return <CommitDateBadge ideaId={idea.id} label={label} className={classes} />;
}

function CommitDateBadge({ ideaId, label, className }: { ideaId: string; label: string; className: string }) {
  // undefined: yükleniyor, null: commit yok / alınamadı.
  const [commit, setCommit] = useState<RepoCommit | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchLastCommit(ideaId)
      .then((res) => active && setCommit(res.commit))
      .catch(() => active && setCommit(null));
    return () => {
      active = false;
    };
  }, [ideaId]);

  if (commit === undefined) {
    return (
      <Badge className={className} aria-busy>
        {label}
        <Loader2 className="size-3 animate-spin" aria-label="son commit yükleniyor" />
      </Badge>
    );
  }
  if (!commit?.date) return <Badge className={className}>{label}</Badge>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn(className, "cursor-default")}>
          {label} · {formatDate(commit.date)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex max-w-72 flex-col gap-0.5 text-xs">
          <span>Son commit: {formatDateTime(commit.date)}</span>
          <span className="truncate">{commit.message.split("\n")[0]}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
