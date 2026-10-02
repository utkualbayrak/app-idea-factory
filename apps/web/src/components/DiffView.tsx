import { useMemo } from "react";
import { diffLines } from "diff";

// Satır bazlı diff (eski → yeni). Değişmeyen uzun bloklar katlanır, her
// değişikliğin etrafında CONTEXT satır kalır.
const CONTEXT = 3;

type Line = { kind: "add" | "del" | "same"; text: string };
type Row = Line | { kind: "skip"; count: number };

function buildRows(oldText: string, newText: string): Row[] {
  const lines: Line[] = [];
  for (const part of diffLines(oldText, newText)) {
    const kind = part.added ? "add" : part.removed ? "del" : "same";
    const split = part.value.replace(/\n$/, "").split("\n");
    for (const text of split) lines.push({ kind, text });
  }

  const keep = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) keep[j] = true;
  });

  const rows: Row[] = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    if (keep[i]) {
      if (skipped) rows.push({ kind: "skip", count: skipped });
      skipped = 0;
      rows.push(line);
    } else skipped++;
  });
  if (skipped) rows.push({ kind: "skip", count: skipped });
  return rows;
}

const LINE_STYLES = {
  add: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  del: "bg-red-50 text-red-900 line-through decoration-red-400/60 dark:bg-red-950/60 dark:text-red-200",
  same: "text-muted-foreground",
};

const LINE_PREFIX = { add: "+", del: "−", same: " " };

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const rows = useMemo(() => buildRows(oldText, newText), [oldText, newText]);
  const changed = rows.some((r) => r.kind === "add" || r.kind === "del");

  if (!changed) return <p className="text-sm text-muted-foreground">Fark yok.</p>;

  return (
    <div className="max-h-[32rem] overflow-auto rounded-md border font-mono text-xs leading-relaxed">
      {rows.map((row, i) =>
        row.kind === "skip" ? (
          <div key={i} className="border-y bg-muted/50 px-3 py-0.5 text-muted-foreground">
            … {row.count} satır değişmedi
          </div>
        ) : (
          <div key={i} className={`flex gap-2 px-3 whitespace-pre-wrap break-words ${LINE_STYLES[row.kind]}`}>
            <span className="shrink-0 select-none" aria-hidden>
              {LINE_PREFIX[row.kind]}
            </span>
            <span className="min-w-0">{row.text || " "}</span>
          </div>
        ),
      )}
    </div>
  );
}
