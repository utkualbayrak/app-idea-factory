import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface CategoryDatum {
  label: string;
  value: number;
}

const MAX_ROWS = 8;

// Kategori dağılımı: tek seri (fikir sayısı) → tek renk (--chart-series), kategori
// kimliği etikette. Kategoriler sırasız (nominal) olduğu için değere göre renk
// koyulaştırılmaz. 8'den fazla kategori "Diğer"e katlanır.
export function CategoryBars({ data }: { data: CategoryDatum[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const rows =
    sorted.length > MAX_ROWS
      ? [
          ...sorted.slice(0, MAX_ROWS - 1),
          { label: "Diğer", value: sorted.slice(MAX_ROWS - 1).reduce((sum, d) => sum + d.value, 0) },
        ]
      : sorted;

  const total = rows.reduce((sum, d) => sum + d.value, 0);
  const max = Math.max(1, ...rows.map((d) => d.value));

  if (total === 0) return <p className="text-sm text-muted-foreground">Bu dönemde fikir yok.</p>;

  return (
    <ul className="flex flex-col gap-2" aria-label="Kategori dağılımı">
      {rows.map((d) => {
        const share = Math.round((d.value / total) * 100);
        return (
          <li key={d.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Satırın tamamı hover/focus hedefi — sadece boyalı bar değil. */}
                <div
                  tabIndex={0}
                  className="group flex cursor-default items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="w-28 shrink-0 truncate text-sm sm:w-40">{d.label}</span>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div
                      className="h-3 rounded-r-[4px] bg-chart-series transition-opacity group-hover:opacity-80"
                      style={{ width: `${(d.value / max) * 100}%`, minWidth: 4 }}
                    />
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{d.value}</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-semibold">{d.value} fikir</span> · %{share} · {d.label}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
