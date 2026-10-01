import { useEffect, useState } from "react";
import { formatBatchDate } from "@/lib/format-date";

export interface TrendPoint {
  date: string; // batch_date, YYYY-MM-DD
  average: number; // o günün fikirlerinin ortalama Claude overall puanı
  count: number;
}

const HEIGHT = 180;
const PAD = { top: 16, right: 44, bottom: 24, left: 28 };
const Y_TICKS = [0, 5, 10];

// Callback ref: ölçülen eleman değişirse (boş durum ↔ grafik) gözlemci yenisine taşınır.
function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

// Günlük ortalama Claude puanı (0-10, tek eksen, tek seri → legend yok, başlık
// söylüyor). 2px çizgi + %10 alan dolgusu, son noktada yüzey halkalı nokta ve
// değer etiketi; hover/klavye ile en yakın güne oturan crosshair + tooltip.
export function ScoreTrendChart({ points }: { points: TrendPoint[] }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / 10) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.average)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = points.length - 1;

  function indexFromClientX(clientX: number, rect: DOMRect) {
    if (points.length === 1) return 0;
    const ratio = (clientX - rect.left - PAD.left) / innerW;
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  }

  const activePoint = active != null ? points[active] : null;

  // Kap her zaman render edilir ki genişlik ölçümü (ResizeObserver) veri
  // sonradan gelse de çalışsın.
  if (points.length === 0)
    return (
      <div ref={containerRef}>
        <p className="text-sm text-muted-foreground">Bu dönemde fikir yok.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="relative w-full">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Günlük ortalama Claude puanı"
            tabIndex={0}
            className="block outline-none"
            onPointerMove={(e) => setActive(indexFromClientX(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(last)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last) - 1));
              if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? last) + 1));
            }}
          >
            {/* Yatay ızgara + y ekseni etiketleri: düz, ince, geri planda. */}
            {Y_TICKS.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px]">
                  {t}
                </text>
              </g>
            ))}

            {/* X ekseni: yalnızca ilk ve son gün. */}
            <text x={x(0)} y={HEIGHT - 6} textAnchor={points.length === 1 ? "middle" : "start"} className="fill-muted-foreground text-[11px]">
              {formatBatchDate(points[0].date)}
            </text>
            {points.length > 1 && (
              <text x={x(last)} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {formatBatchDate(points[last].date)}
              </text>
            )}

            <path d={areaPath} className="fill-chart-series" fillOpacity={0.1} />
            <path d={linePath} fill="none" className="stroke-chart-series" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {activePoint && active != null && (
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-muted-foreground" strokeWidth={1} />
            )}

            {/* Son nokta (her zaman) + aktif nokta: 2px kart rengi halkalı. */}
            {[last, ...(active != null && active !== last ? [active] : [])].map((i) => (
              <circle key={i} cx={x(i)} cy={y(points[i].average)} r={4} className="fill-chart-series stroke-card" strokeWidth={2} />
            ))}
            <text x={x(last) + 8} y={y(points[last].average)} dy="0.32em" className="fill-foreground text-xs font-medium">
              {points[last].average.toFixed(2)}
            </text>
          </svg>
        )}

        {activePoint && active != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(x(active) - 60, 0), Math.max(0, width - 130)),
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-chart-series" />
              <span className="font-semibold text-foreground">{activePoint.average.toFixed(2)}/10</span>
            </div>
            <div className="text-muted-foreground">
              {formatBatchDate(activePoint.date)} · {activePoint.count} fikir
            </div>
          </div>
        )}
      </div>

      {/* Tablo görünümü: tooltip'teki her değer hover olmadan da erişilebilir. */}
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">Tablo olarak gör</summary>
        <div className="mt-2 max-h-60 overflow-auto rounded-md border">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Gün</th>
                <th className="px-3 py-1.5 font-medium">Ortalama</th>
                <th className="px-3 py-1.5 font-medium">Fikir</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t">
                  <td className="px-3 py-1.5 tabular-nums">{formatBatchDate(p.date)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{p.average.toFixed(2)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
