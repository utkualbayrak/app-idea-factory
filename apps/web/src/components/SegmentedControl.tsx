import { Button } from "@/components/ui/button";

// Birkaç seçenekten birini seçtiren küçük segment düğme grubu
// ("Repodaki / Onaylı / Fark", "Geçti / Kısmen / Kaldı" vb.).
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T | null;
  options: { value: T; label: string; activeClassName?: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="ghost"
            className={`h-7 px-2.5 ${active ? (option.activeClassName ?? "bg-background shadow-sm hover:bg-background") : ""}`}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
