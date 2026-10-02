import { formatDateTime } from "@/lib/format-date";
import { SYSTEM_ACTOR, useUserNames } from "@/lib/user-names";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// "Utku güncelledi · 01.10.2026 14:20" — kayıtlardaki "en son kim güncelledi"
// satırı. Kim bilinmiyorsa (eski kayıt) hiçbir şey göstermez.
export function UpdatedBy({
  by,
  at,
  verb = "güncelledi",
  className,
}: {
  by: string | null | undefined;
  at?: string | null;
  verb?: string;
  className?: string;
}) {
  const { displayName } = useUserNames();
  if (!by) return null;

  const name = displayName(by);
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {by === SYSTEM_ACTOR ? (
        <span>{name}</span>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default font-medium underline decoration-dotted underline-offset-2">{name}</span>
          </TooltipTrigger>
          <TooltipContent>{by}</TooltipContent>
        </Tooltip>
      )}{" "}
      {verb}
      {at && ` · ${formatDateTime(at)}`}
    </p>
  );
}
