import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number | null;
  onChange?: (value: number) => void;
  size?: "sm" | "lg";
}

export function StarRating({ value, onChange, size = "sm" }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  const interactive = Boolean(onChange);
  const iconSize = size === "lg" ? 26 : 15;

  return (
    <span className="inline-flex items-center gap-0.5" role={interactive ? "radiogroup" : undefined}>
      {stars.map((star) => {
        const filled = value != null && star <= value;
        return (
          <button
            key={star}
            type="button"
            className={cn(
              "rounded-sm text-muted-foreground/40 transition-colors",
              interactive && "cursor-pointer hover:text-primary",
              !interactive && "cursor-default",
            )}
            disabled={!interactive}
            aria-label={`${star} yıldız`}
            aria-pressed={filled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange?.(star);
            }}
          >
            <Star size={iconSize} fill={filled ? "currentColor" : "none"} className={cn(filled && "text-primary")} />
          </button>
        );
      })}
    </span>
  );
}
