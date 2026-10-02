import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clipboard, ClipboardCheck, GitCompare, Hammer, Search, Sparkles } from "lucide-react";
import {
  fetchIdea,
  fetchIdeas,
  fetchIdeaTask,
  fetchCompetitors,
  fetchDevReports,
  fetchTestRounds,
  fetchWorkflowRuns,
  patchIdea,
  type Idea,
  type Competitor,
  type DevReport,
  type TestRound,
  type IdeaWorkflow,
  type RepoState,
  type Task,
  type TaskDocument,
  type WorkflowRun,
} from "@/lib/api";
import { ActivityBadge } from "@/components/ActivityBadge";
import { isActivityUnread } from "@/lib/activity";
import { ScoreSlider } from "@/components/ScoreSlider";
import { ScoreReasonPopover } from "@/components/ScoreReasonPopover";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SourceIcon } from "@/components/SourceIcon";
import { WorkflowTriggerButton } from "@/components/WorkflowTriggerButton";
import { LastRunLine } from "@/components/LastRunLine";
import { DevelopmentCard } from "@/components/DevelopmentCard";
import { DevReportsCard } from "@/components/DevReportsCard";
import { ReworkBanner, TestCard } from "@/components/TestCard";
import { TASK_IN_PROGRESS_STATUSES } from "@/lib/task-labels";
import { PageMessage } from "@/components/PageHeader";
import { formatDateTime } from "@/lib/format-date";
import { SCORE_HELP } from "@/lib/score-help";
import { categoryColorClasses, ideaSection, statusColorClasses, STATUS_LABELS } from "@/lib/idea-colors";
import { ideaToMarkdown } from "@/lib/export-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


type Similarity = NonNullable<Competitor["similarity"]>;

const SIMILARITY_LABELS: Record<Similarity, string> = {
  direct: "Doğrudan",
  partial: "Kısmi",
  alternative: "Alternatif",
};

const SIMILARITY_STYLES: Record<Similarity, string> = {
  direct: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  alternative: "bg-muted text-muted-foreground",
};

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [otherIdeas, setOtherIdeas] = useState<Idea[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [documents, setDocuments] = useState<TaskDocument[]>([]);
  const [repo, setRepo] = useState<RepoState | null>(null);
  const [devReports, setDevReports] = useState<DevReport[]>([]);
  const [testRounds, setTestRounds] = useState<TestRound[]>([]);

  const loadRuns = useCallback(() => {
    if (!id) return;
    fetchWorkflowRuns({ ideaId: id, limit: 20 })
      .then((res) => setRuns(res.runs))
      .catch(() => setRuns([]));
  }, [id]);

  const loadTask = useCallback(() => {
    if (!id) return;
    fetchIdeaTask(id)
      .then((res) => {
        setTask(res.task);
        setDocuments(res.documents);
        setRepo(res.repo);
      })
      .catch(() => {});
    fetchDevReports(id)
      .then((res) => setDevReports(res.reports))
      .catch(() => {});
    fetchTestRounds(id)
      .then((res) => setTestRounds(res.rounds))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchIdea(id)
      .then((res) => {
        setIdea(res.idea);
        setNote(res.idea.user_note ?? "");
        // Detay açıldı = son aktivite görüldü; listedeki okunmamış noktası kalkar.
        if (isActivityUnread(res.idea)) {
          patchIdea(id, { mark_seen: true })
            .then((seen) => setIdea(seen.idea))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    fetchCompetitors(id)
      .then((res) => setCompetitors(res.competitors))
      .catch(() => setCompetitors([]));
    loadRuns();
    loadTask();
  }, [id, loadRuns, loadTask]);

  // Belgeler hazırlanırken / iskelet kurulurken sayfa kendini yeniler; iş
  // bitince ya da patlayınca durur.
  const taskInProgress = task != null && TASK_IN_PROGRESS_STATUSES.includes(task.status);
  useEffect(() => {
    if (!taskInProgress || !id) return;
    const timer = setInterval(() => {
      loadTask();
      loadRuns();
      fetchIdea(id)
        .then((res) => setIdea(res.idea))
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(timer);
  }, [taskInProgress, id, loadTask, loadRuns]);

  // Bir iş tetiklenince fikrin aktivite rozeti ("Rakip aranıyor…" vb.) ve
  // son iş satırı hemen güncellensin.
  const handleTriggered = useCallback(() => {
    if (!id) return;
    fetchIdea(id)
      .then((res) => setIdea(res.idea))
      .catch(() => {});
    loadRuns();
    loadTask();
  }, [id, loadRuns, loadTask]);

  const lastRun = (workflow: IdeaWorkflow) => runs.find((run) => run.workflow === workflow);

  async function handleRate(value: number) {
    if (!id) return;
    const res = await patchIdea(id, { user_rating: value });
    setIdea(res.idea);
  }

  async function handleSaveNote() {
    if (!id) return;
    setSaving(true);
    try {
      const res = await patchIdea(id, { user_note: note || null });
      setIdea(res.idea);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetHold(nextStatus: "new" | "on_hold") {
    if (!id) return;
    const res = await patchIdea(id, { status: nextStatus });
    setIdea(res.idea);
  }

  async function handleDelete() {
    if (!id) return;
    const res = await patchIdea(id, { status: "deleted" });
    setIdea(res.idea);
  }

  function handleCompareMenuOpenChange(open: boolean) {
    if (open && !otherIdeas) {
      fetchIdeas().then((res) => setOtherIdeas(res.ideas.filter((i) => i.id !== id)));
    }
  }

  async function handleExport() {
    if (!idea) return;
    await navigator.clipboard.writeText(ideaToMarkdown(idea));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) return <PageMessage tone="error">Fikir yüklenemedi: {error}</PageMessage>;
  if (!idea) return <PageMessage>Yükleniyor…</PageMessage>;

  return (
    <div className="flex flex-col gap-5">
      {/* Geri butonu + fikir adı + kısa açıklama, üst header'ın (h-14)
          hemen altında sabit kalır — notlar/skor kartı vb. altında scroll'a
          devam eder ("scroll atildikca fikirler back butonu ve fikrin adi
          ile kisa aciklamasi sabit kalsin" isteği). */}
      <div className="sticky top-14 z-[5] -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Link
          to={ideaSection(idea.status).path}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {ideaSection(idea.status).label}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{idea.name}</h1>
          <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>
          <Badge className={statusColorClasses(idea.status)}>{STATUS_LABELS[idea.status]}</Badge>
          <ActivityBadge idea={idea} />
        </div>
        <p className="mt-1 text-muted-foreground">{idea.one_liner}</p>
      </div>

      {idea.status === "rework" && <ReworkBanner rounds={testRounds} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Claude puan dökümü</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScoreBar
            label="Pazar"
            help={SCORE_HELP.market}
            value={idea.scores.market}
            reason={idea.scores.market_reason}
          />
          <ScoreBar
            label="Uygulanabilirlik (solo)"
            help={SCORE_HELP.feasibility_solo_dev}
            value={idea.scores.feasibility_solo_dev}
            reason={idea.scores.feasibility_solo_dev_reason}
          />
          <ScoreBar
            label="Özgünlük"
            help={SCORE_HELP.originality}
            value={idea.scores.originality}
            reason={idea.scores.originality_reason}
          />
          <ScoreBar
            label="Genel"
            help={SCORE_HELP.overall}
            value={idea.scores.overall}
            reason={idea.scores.overall_reason}
            highlight
          />
        </CardContent>
      </Card>

      {task && id && (
        <DevelopmentCard
          ideaId={id}
          ideaStatus={idea.status}
          task={task}
          documents={documents}
          lastPlanRun={lastRun("plan-idea.yml")}
          lastBuildRun={lastRun("build-skeleton.yml")}
          repo={repo}
          onRepoSynced={setRepo}
          onChanged={handleTriggered}
        />
      )}

      {id && <TestCard ideaId={id} ideaStatus={idea.status} rounds={testRounds} onChanged={handleTriggered} />}

      <DevReportsCard reports={devReports} />

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard title="Problem">{idea.problem}</InfoCard>
        <InfoCard title="Hedef kitle">{idea.target_audience}</InfoCard>
      </div>

      <InfoCard title="Temel özellikler">
        <ul className="list-disc space-y-1 pl-5">
          {idea.core_features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </InfoCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard title="Gelir modeli">{idea.monetization}</InfoCard>
        <InfoCard title="İlham kaynakları">
          <div className="flex flex-wrap gap-2">
            {idea.inspiration_sources.map((source) => (
              <SourceIcon key={source} url={source} />
            ))}
          </div>
        </InfoCard>
      </div>

      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {idea.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Rakipler</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {competitors == null ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : competitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz rakip/benzer uygulama bulunmadı.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {competitors.map((c) => (
                <li key={c.id} className="min-w-0 rounded-md border p-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {c.similarity && (
                      <Badge className={`shrink-0 ${SIMILARITY_STYLES[c.similarity]}`}>{SIMILARITY_LABELS[c.similarity]}</Badge>
                    )}
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="truncate font-medium text-primary underline underline-offset-4">
                        {c.app_name}
                      </a>
                    ) : (
                      <span className="truncate font-medium">{c.app_name}</span>
                    )}
                  </div>
                  {c.note && <p className="mt-0.5 text-muted-foreground break-words">{c.note}</p>}
                </li>
              ))}
            </ul>
          )}
          <WorkflowTriggerButton
            label="Rakipleri bul"
            loadingLabel="Tetikleniyor…"
            successMessage="Tetiklendi — birkaç dakika içinde sayfayı yenileyip kontrol edebilirsin."
            workflow="find-competitors.yml"
            inputs={id ? { idea_id: id } : undefined}
            icon={<Search className="size-4" />}
            onTriggered={handleTriggered}
          />
          <LastRunLine run={lastRun("find-competitors.yml")} label="Son arama" />
        </CardContent>
      </Card>

      <InfoCard title="Senin puanın">
        <ScoreSlider value={idea.user_rating} onChange={handleRate} />
      </InfoCard>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Not</CardTitle>
          {idea.user_note_updated_at && (
            <p className="text-xs text-muted-foreground">
              Son güncelleme: {formatDateTime(idea.user_note_updated_at)}
            </p>
          )}
          {idea.last_reevaluated_at && (
            <p className="text-xs text-muted-foreground">
              Son yeniden değerlendirme: {formatDateTime(idea.last_reevaluated_at)}
            </p>
          )}
          {idea.last_reevaluation_summary && (
            <p className="rounded-md bg-muted px-2 py-1.5 text-xs break-words text-muted-foreground">
              <span className="font-medium text-foreground">Değerlendirme özeti:</span> {idea.last_reevaluation_summary}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Label htmlFor="note" className="sr-only">
            Not
          </Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Kısa bir not ekle…" />
          <Button onClick={handleSaveNote} disabled={saving} className="w-fit">
            {saving ? "Kaydediliyor…" : "Notu kaydet"}
          </Button>
          <WorkflowTriggerButton
            label="Notlarımla yeniden değerlendir"
            loadingLabel="Tetikleniyor…"
            successMessage="Tetiklendi — birkaç dakika içinde sayfayı yenileyip kontrol edebilirsin."
            workflow="reevaluate-idea.yml"
            inputs={id ? { idea_id: id } : undefined}
            disabled={!idea.user_note}
            icon={<Sparkles className="size-4" />}
            onTriggered={handleTriggered}
          />
          <LastRunLine run={lastRun("reevaluate-idea.yml")} label="Son değerlendirme işi" />
          {!idea.user_note && (
            <p className="text-xs text-muted-foreground">Yeniden değerlendirme için önce bir not ekleyip kaydet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={handleExport}>
          {copied ? <ClipboardCheck className="size-4" /> : <Clipboard className="size-4" />}
          {copied ? "Kopyalandı" : "Dışa aktar"}
        </Button>
        <DropdownMenu onOpenChange={handleCompareMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <GitCompare className="size-4" />
              Karşılaştır
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {!otherIdeas ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Yükleniyor…</div>
            ) : otherIdeas.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Karşılaştırılacak başka fikir yok.</div>
            ) : (
              otherIdeas.map((other) => (
                <DropdownMenuItem key={other.id} onClick={() => navigate(`/compare?ids=${id},${other.id}`)}>
                  <span className="truncate">{other.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{other.category}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {idea.status === "on_hold" ? (
          <ConfirmButton
            label="Askıdan çıkar"
            title="Fikri askıdan çıkar?"
            description="Fikir tekrar aktif duruma dönecek."
            confirmLabel="Çıkar"
            variant="outline"
            onConfirm={() => handleSetHold("new")}
          />
        ) : (
          <ConfirmButton
            label="Askıya al"
            title="Fikri askıya al?"
            description="Fikir listede soluk görünecek ama kaybolmayacak; istediğin zaman tekrar aktif edebilirsin."
            confirmLabel="Askıya al"
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
            disabled={idea.status === "deleted"}
            onConfirm={() => handleSetHold("on_hold")}
          />
        )}
        <ConfirmButton
          label="Sil"
          title="Fikri sil?"
          description="Fikir listeden tamamen kaldırılır (yalnızca isim tekrarı kontrolü için veritabanında kalır). Bu ekrandan geri alınamaz."
          confirmLabel="Sil"
          variant="destructive"
          confirmVariant="destructive"
          disabled={idea.status === "deleted"}
          onConfirm={handleDelete}
        />
        {!task && (idea.status === "new" || idea.status === "on_hold") && (
          <Button asChild>
            <Link to={`/ideas/${id}/develop`}>
              <Hammer className="size-4" />
              Geliştir
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  // min-w-0: grid/flex öğeleri varsayılan olarak min-width:auto alır, yani
  // içerik (örn. uzun bir kelime) sarmasa bile küçülmeyi reddedip mobilde
  // sayfayı sağa taşırabiliyordu (İlham kaynakları'ndaki uzun url'lerle
  // aynı hizadaki Gelir modeli kartında yaşanan bug buydu). break-words da
  // benzer bir metin için ek güvence.
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 break-words">{children}</CardContent>
    </Card>
  );
}

function ScoreBar({
  label,
  help,
  value,
  reason,
  highlight,
}: {
  label: string;
  help: string;
  value: number;
  reason: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(140px,180px)_1fr_56px] items-center gap-3 text-sm">
      <span className={highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>
        <ScoreReasonPopover label={label} help={help} value={value} reason={reason} />
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-right text-muted-foreground">{value.toFixed(2)}/10</span>
    </div>
  );
}
