import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, GripVertical } from "lucide-react";
import {
  cancelTestRound,
  fetchIdeas,
  fetchIdeaTask,
  fetchTestRounds,
  patchIdea,
  startBuild,
  type Idea,
  type IdeaStatus,
} from "@/lib/api";
import { COMMIT_DATE_STATUSES, categoryColorClasses, STATUS_LABELS } from "@/lib/idea-colors";
import { formatDateTime, formatRelative } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { IdeaStatusBadge } from "@/components/IdeaStatusBadge";
import { ListPageLayout, PageHeader, PageMessage } from "@/components/PageHeader";
import { DevReportForm } from "@/pages/DevReportPage";
import { TestPlanForm } from "@/pages/TestPlanPage";
import { TestResultForm } from "@/pages/TestResultPage";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Kanban: geliştirme, test ve dağıtım aşamasındaki fikirler. Kart başka bir
// sütuna bırakılınca durum kanbanda değişmez; o geçişin formu (ya da formsuz
// geçişlerde kısa bir onay) açılır, durum ancak gönderilince değişir.

type Column = { status: IdeaStatus; group: string; accent: string; tint: string; ring: string };

const COLUMNS: Column[] = [
  {
    status: "awaiting_development",
    group: "Geliştirme",
    accent: "border-t-indigo-500",
    tint: "bg-indigo-50/60 dark:bg-indigo-950/25",
    ring: "ring-indigo-500",
  },
  {
    status: "in_development",
    group: "Geliştirme",
    accent: "border-t-violet-500",
    tint: "bg-violet-50/60 dark:bg-violet-950/25",
    ring: "ring-violet-500",
  },
  {
    status: "rework",
    group: "Geliştirme",
    accent: "border-t-rose-500",
    tint: "bg-rose-50/60 dark:bg-rose-950/25",
    ring: "ring-rose-500",
  },
  {
    status: "awaiting_test",
    group: "Test",
    accent: "border-t-cyan-500",
    tint: "bg-cyan-50/60 dark:bg-cyan-950/25",
    ring: "ring-cyan-500",
  },
  {
    status: "testing",
    group: "Test",
    accent: "border-t-teal-500",
    tint: "bg-teal-50/60 dark:bg-teal-950/25",
    ring: "ring-teal-500",
  },
  {
    status: "approved",
    group: "Dağıtım",
    accent: "border-t-emerald-500",
    tint: "bg-emerald-50/60 dark:bg-emerald-950/25",
    ring: "ring-emerald-500",
  },
];

const BOARD_STATUSES = COLUMNS.map((c) => c.status);

type FormAction = { kind: "form"; form: "dev-report" | "test-plan" } | { kind: "form"; form: "test-result"; decision: "approved" | "rework" };
type ConfirmAction = { kind: "confirm"; action: "start-build" | "undo-test" | "cancel-test" };
type DropAction = FormAction | ConfirmAction;

// İzinli sürüklemeler — detay sayfasındaki butonlarla aynı geçişler.
function dropAction(from: IdeaStatus, to: IdeaStatus): DropAction | null {
  if (from === "awaiting_development" && to === "in_development") return { kind: "confirm", action: "start-build" };
  if ((from === "in_development" || from === "rework") && to === "awaiting_test") return { kind: "form", form: "dev-report" };
  if (from === "awaiting_test" && to === "testing") return { kind: "form", form: "test-plan" };
  if (from === "awaiting_test" && to === "in_development") return { kind: "confirm", action: "undo-test" };
  if (from === "testing" && to === "approved") return { kind: "form", form: "test-result", decision: "approved" };
  if (from === "testing" && to === "rework") return { kind: "form", form: "test-result", decision: "rework" };
  if (from === "testing" && to === "awaiting_test") return { kind: "confirm", action: "cancel-test" };
  return null;
}

const CONFIRM_TEXT: Record<ConfirmAction["action"], { title: string; description: string; label: string }> = {
  "start-build": {
    title: "İskelet üretimini başlat?",
    description:
      "Belgeler kilitlenir; özel bir GitHub reposu ve issue açılır, Claude Code iskeleti kurar (genelde 15–45 dakika).",
    label: "Başlat",
  },
  "undo-test": {
    title: "Geliştiriliyor'a geri al?",
    description: "Fikir Geliştirilenler'e döner. Geliştirme raporu kalır; tekrar 'Geliştirildi' dediğinde aynı raporu güncellersin.",
    label: "Geri al",
  },
  "cancel-test": {
    title: "Test turunu iptal et?",
    description: 'Tur "İptal edildi" olarak geçmişte kalır, fikir tekrar "Test bekliyor" olur.',
    label: "İptal et",
  },
};

function detailHref(idea: Idea): string {
  const section = ["awaiting_test", "testing", "approved"].includes(idea.status) ? "test" : "gelistirme";
  return `/ideas/${idea.id}#${section}`;
}

type Pending = { idea: Idea; to: IdeaStatus; action: DropAction };

export function KanbanPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(load, [load]);

  const sensors = useSensors(
    // Küçük bir eşik: karttaki "Detay" butonuna tıklamak sürükleme başlatmasın.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Dokunmatikte basılı tutunca sürüklenir; hızlı kaydırma sütunları kaydırır.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const map = new Map<IdeaStatus, Idea[]>(BOARD_STATUSES.map((s) => [s, []]));
    for (const idea of ideas ?? []) map.get(idea.status)?.push(idea);
    for (const list of map.values())
      list.sort((a, b) => (b.status_changed_at ?? b.created_at).localeCompare(a.status_changed_at ?? a.created_at));
    return map;
  }, [ideas]);

  const activeIdea = activeId ? (ideas ?? []).find((i) => i.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const idea = (ideas ?? []).find((i) => i.id === event.active.id);
    const to = event.over?.id as IdeaStatus | undefined;
    if (!idea || !to || to === idea.status) return;
    const action = dropAction(idea.status, to);
    if (!action) return;
    setConfirmError(null);
    setPending({ idea, to, action });
  }

  function closePending() {
    setPending(null);
    setConfirmError(null);
  }

  function handleFormDone() {
    closePending();
    load();
  }

  async function runConfirm(action: ConfirmAction["action"], idea: Idea) {
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (action === "start-build") {
        const { task } = await fetchIdeaTask(idea.id);
        if (!task || (task.status !== "ready" && task.status !== "failed"))
          throw new Error("Planlama belgeleri henüz hazır değil; detay sayfasından takip et.");
        await startBuild(task.id);
      } else if (action === "undo-test") {
        await patchIdea(idea.id, { status: "in_development" });
      } else {
        const { rounds } = await fetchTestRounds(idea.id);
        const running = rounds.find((r) => r.status === "running");
        if (!running) throw new Error("Açık bir test turu bulunamadı.");
        await cancelTestRound(running.id);
      }
      closePending();
      load();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmBusy(false);
    }
  }

  const header = (
    <PageHeader
      title="Kanban"
      description="Geliştirme, test ve dağıtım aşamasındaki fikirler. Kartı başka bir sütuna sürükleyince o adımın formu açılır; durum ancak form gönderilince değişir."
    />
  );

  if (error)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage tone="error">Fikirler yüklenemedi: {error}</PageMessage>
      </div>
    );
  if (!ideas)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage>Yükleniyor…</PageMessage>
      </div>
    );

  const formAction = pending?.action.kind === "form" ? pending.action : null;
  const confirmAction = pending?.action.kind === "confirm" ? pending.action : null;

  return (
    <ListPageLayout>
      {header}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Kartı taşımak için boşluk ya da Enter'a bas, ok tuşlarıyla sütun seç, bırakmak için tekrar boşluk ya da Enter'a bas. Escape iptal eder.",
          },
        }}
      >
        <div className="-mx-1 flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto px-1 pb-2">
          {COLUMNS.map((column) => (
            <BoardColumn
              key={column.status}
              column={column}
              ideas={byStatus.get(column.status) ?? []}
              activeIdea={activeIdea}
              activeId={activeId}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeIdea ? <IdeaCard idea={activeIdea} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={formAction != null} onOpenChange={(open) => !open && closePending()}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle className="sr-only">
            {pending ? `${pending.idea.name}: ${STATUS_LABELS[pending.idea.status]} → ${STATUS_LABELS[pending.to]}` : "Durum değişikliği"}
          </DialogTitle>
          {pending && formAction?.form === "dev-report" && (
            <DevReportForm ideaId={pending.idea.id} onDone={handleFormDone} onCancel={closePending} inDialog />
          )}
          {pending && formAction?.form === "test-plan" && (
            <TestPlanForm ideaId={pending.idea.id} onDone={handleFormDone} onCancel={closePending} inDialog />
          )}
          {pending && formAction?.form === "test-result" && (
            <TestResultForm
              ideaId={pending.idea.id}
              onDone={handleFormDone}
              onCancel={closePending}
              initialDecision={formAction.decision}
              inDialog
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAction != null} onOpenChange={(open) => !open && !confirmBusy && closePending()}>
        <AlertDialogContent>
          {pending && confirmAction && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM_TEXT[confirmAction.action].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-medium text-foreground">{pending.idea.name}</span> ·{" "}
                  {CONFIRM_TEXT[confirmAction.action].description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {confirmError && <p className="text-sm break-words text-destructive">{confirmError}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={confirmBusy}>Vazgeç</AlertDialogCancel>
                <Button disabled={confirmBusy} onClick={() => runConfirm(confirmAction.action, pending.idea)}>
                  {confirmBusy ? "Yapılıyor…" : CONFIRM_TEXT[confirmAction.action].label}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </ListPageLayout>
  );
}

function BoardColumn({
  column,
  ideas,
  activeIdea,
  activeId,
}: {
  column: Column;
  ideas: Idea[];
  activeIdea: Idea | null;
  activeId: string | null;
}) {
  const allowed = activeIdea != null && dropAction(activeIdea.status, column.status) != null;
  const isOrigin = activeIdea?.status === column.status;
  const { setNodeRef, isOver } = useDroppable({ id: column.status, disabled: !allowed });

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[column.status]}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-lg border border-t-4 transition-[opacity,box-shadow]",
        column.accent,
        column.tint,
        activeIdea && !allowed && !isOrigin && "opacity-40",
        allowed && "ring-2 ring-offset-2 ring-offset-background",
        allowed && (isOver ? column.ring : "ring-muted-foreground/30"),
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{column.group}</p>
          <h2 className="truncate text-sm font-semibold">{STATUS_LABELS[column.status]}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-background/80 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {ideas.length}
        </span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {ideas.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Boş</p>
        ) : (
          ideas.map((idea) => <DraggableCard key={idea.id} idea={idea} dimmed={idea.id === activeId} />)
        )}
      </div>
    </section>
  );
}

function DraggableCard({ idea, dimmed }: { idea: Idea; dimmed: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: idea.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("touch-manipulation", dimmed && "opacity-30")}
      {...listeners}
      {...attributes}
      aria-roledescription="sürüklenebilir kart"
    >
      <IdeaCard idea={idea} />
    </div>
  );
}

function IdeaCard({ idea, overlay = false }: { idea: Idea; overlay?: boolean }) {
  const changedAt = idea.status_changed_at ?? idea.created_at;
  return (
    <article
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-xs active:cursor-grabbing",
        overlay && "rotate-1 cursor-grabbing shadow-lg ring-1 ring-border",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium">{idea.name}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{idea.one_liner}</span>
        </div>
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {idea.category && <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>}
        {/* Sürükleme kopyasında yeniden istek atmamak için commit tarihli rozet yalnızca asıl kartta. */}
        {!overlay && COMMIT_DATE_STATUSES.includes(idea.status) && <IdeaStatusBadge idea={idea} />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-xs text-muted-foreground">Durum: {formatRelative(changedAt)}</span>
          </TooltipTrigger>
          <TooltipContent>Son durum değişikliği: {formatDateTime(changedAt)}</TooltipContent>
        </Tooltip>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          // Klavyeyle sürükleme kartın Enter/boşluk tuşunu dinliyor; link'te
          // Enter sürükleme değil gezinme olsun.
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Link to={detailHref(idea)}>
            Detay
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
