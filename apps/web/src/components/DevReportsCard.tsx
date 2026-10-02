import { Check, Minus } from "lucide-react";
import type { DevReport } from "@/lib/api";
import { groupByPhase } from "@/lib/roadmap";
import { formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserNames } from "@/lib/user-names";

// Fikir detayında geliştirme raporları ("Geliştirildi" formu), en yeni tur üstte.
export function DevReportsCard({ reports }: { reports: DevReport[] }) {
  if (reports.length === 0) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Geliştirme raporları</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {reports.map((report) => (
          <ReportBlock key={report.id} report={report} />
        ))}
      </CardContent>
    </Card>
  );
}

function ReportBlock({ report }: { report: DevReport }) {
  const { displayName } = useUserNames();
  const done = report.roadmap_items.filter((i) => i.done).length;
  const total = report.roadmap_items.length;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{report.round}. tur</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(report.updated_at)}
          {report.updated_by && ` · ${displayName(report.updated_by)}`}
        </p>
      </div>

      {total > 0 && (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
            Yol haritası: {done}/{total} görev tamamlandı
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {groupByPhase(report.roadmap_items).map((group, gi) => (
              <div key={gi}>
                {group.phase && <p className="text-xs font-medium text-muted-foreground">{group.phase}</p>}
                <ul className="mt-1 flex flex-col gap-0.5">
                  {group.items.map((item, ii) => (
                    <li key={ii} className={`flex items-start gap-1.5 ${item.done ? "" : "text-muted-foreground"}`}>
                      {item.done ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Minus className="mt-0.5 size-4 shrink-0" />
                      )}
                      <span className="min-w-0 break-words">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      <ReportList title="Eksik kalanlar" values={report.missing_features} />
      <ReportList title="Fazladan eklenenler" values={report.extra_features} />
      <ReportList title="Notlar" values={report.notes} />
    </div>
  );
}

function ReportList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {values.map((value, i) => (
          <li key={i} className="break-words">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}
