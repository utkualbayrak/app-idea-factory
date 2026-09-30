import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ScoreReasonPopoverProps {
  label: string;
  help: string;
  value: number;
  reason: string;
}

// Skor etiketinin yanındaki "?" ikonu parametrenin ne anlama geldiğini
// tooltip'te açıklar; etiketin kendisine tıklamak Claude'un o puanı neden
// verdiğine dair gerekçe metnini popover'da gösterir (notes.txt madde 15/24).
export function ScoreReasonPopover({ label, help, value, reason }: ScoreReasonPopoverProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cursor-pointer text-left underline decoration-dotted underline-offset-4"
          >
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-sm">
          <p className="font-medium text-foreground">
            {label}: {value.toFixed(2)}/10
          </p>
          <p className="mt-1 text-muted-foreground">{reason}</p>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="size-3.5 shrink-0 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    </span>
  );
}
