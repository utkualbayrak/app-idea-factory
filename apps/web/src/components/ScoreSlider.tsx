import { Slider } from "@/components/ui/slider";

interface ScoreSliderProps {
  value: number | null;
  onChange: (value: number) => void;
}

// 0.00-10.00 arası, 0.25 adımlarla (41 durak) — notes.txt madde 6.
export function ScoreSlider({ value, onChange }: ScoreSliderProps) {
  const current = value ?? 0;

  return (
    <div className="flex max-w-sm items-center gap-4">
      <Slider
        min={0}
        max={10}
        step={0.25}
        value={[current]}
        onValueChange={([v]) => onChange(v)}
        aria-label="Kullanıcı puanı"
      />
      <span className="w-14 shrink-0 text-right text-lg font-semibold tabular-nums">{current.toFixed(2)}</span>
    </div>
  );
}
