import { Link } from "react-router-dom";
import { Pencil, RotateCcw } from "lucide-react";
import type { Task, TaskDocument, WorkflowRun } from "@/lib/api";
import {
  AUTH_LABELS,
  BACKEND_LABELS,
  DOCUMENT_LABELS,
  PLATFORM_LABELS,
  REPLANNABLE_STATUSES,
  STYLE_LABELS,
  TASK_STATUS_LABELS,
  THEME_LABELS,
} from "@/lib/task-labels";
import { formatDateTime } from "@/lib/format-date";
import { LastRunLine } from "@/components/LastRunLine";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TASK_STATUS_STYLES: Record<Task["status"], string> = {
  planning: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  planning_failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  ready: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  queued: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  running: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

interface DevelopmentCardProps {
  ideaId: string;
  task: Task;
  documents: TaskDocument[];
  lastPlanRun: WorkflowRun | undefined;
}

// Fikir detayındaki "Geliştirme" kartı: görev parametreleri, durum ve
// Claude'un yazdığı planlama belgeleri (şimdilik salt okunur; düzenleme ve
// "Geliştirmeye başla" Faz 3B'de).
export function DevelopmentCard({ ideaId, task, documents, lastPlanRun }: DevelopmentCardProps) {
  const { params } = task;
  const canReplan = REPLANNABLE_STATUSES.includes(task.status);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Geliştirme</CardTitle>
        <Badge className={TASK_STATUS_STYLES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{PLATFORM_LABELS[params.platform]}</dd>
          <dt className="text-muted-foreground">Backend</dt>
          <dd>{BACKEND_LABELS[params.backend]}</dd>
          <dt className="text-muted-foreground">Kimlik doğrulama</dt>
          <dd>{AUTH_LABELS[params.auth]}</dd>
          <dt className="text-muted-foreground">Tasarım</dt>
          <dd>
            {THEME_LABELS[params.design.theme]} · {STYLE_LABELS[params.design.style]}
          </dd>
          <dt className="text-muted-foreground">MVP özellikleri</dt>
          <dd className="min-w-0">
            <ul className="list-disc space-y-0.5 pl-5">
              {params.mvp_features.map((feature) => (
                <li key={feature} className="break-words">
                  {feature}
                </li>
              ))}
            </ul>
          </dd>
          {params.notes && (
            <>
              <dt className="text-muted-foreground">Notlar</dt>
              <dd className="break-words whitespace-pre-wrap">{params.notes}</dd>
            </>
          )}
        </dl>

        {task.status === "planning" && (
          <p className="text-sm text-muted-foreground">
            Claude planlama belgelerini yazıyor — genelde birkaç dakika sürer, bu sayfa kendini yeniler.
          </p>
        )}
        {task.status === "planning_failed" && task.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm break-words text-red-800 dark:bg-red-950 dark:text-red-200">
            {task.error}
          </p>
        )}

        {documents.length > 0 && (
          <Tabs defaultValue={documents[0].kind} className="min-w-0">
            {/* Mobilde dört sekme sığmazsa satır kendi içinde kayar. */}
            <div className="overflow-x-auto">
              <TabsList>
                {documents.map((doc) => (
                  <TabsTrigger key={doc.kind} value={doc.kind}>
                    {DOCUMENT_LABELS[doc.kind]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {documents.map((doc) => (
              <TabsContent key={doc.kind} value={doc.kind} className="min-w-0 rounded-md border p-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Üretildi: {formatDateTime(doc.generated_at)}
                  {doc.user_edited_at && ` · Son düzenleme: ${formatDateTime(doc.user_edited_at)}`}
                </p>
                <Markdown>{doc.content}</Markdown>
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="flex flex-col gap-1.5">
          {canReplan && (
            <Button asChild variant="outline" className="w-fit">
              <Link to={`/ideas/${ideaId}/develop`}>
                {task.status === "planning_failed" ? <RotateCcw className="size-4" /> : <Pencil className="size-4" />}
                {task.status === "planning_failed" ? "Parametreleri düzenle ve tekrar dene" : "Parametreleri düzenle, yeniden üret"}
              </Link>
            </Button>
          )}
          <LastRunLine run={lastPlanRun} label="Son belge üretimi" />
        </div>
      </CardContent>
    </Card>
  );
}
