import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  fetchDevReports,
  fetchIdea,
  fetchIdeaTask,
  fetchTestRounds,
  submitDevReport,
  syncTaskRepo,
  type DevReport,
  type Idea,
  type RepoState,
  type RoadmapItem,
  type Task,
  type TaskDocument,
  type TestRound,
} from "@/lib/api";
import { DOCUMENT_REPO_PATHS } from "@/lib/task-labels";
import { groupByPhase, parseRoadmap } from "@/lib/roadmap";
import { formatDateTime } from "@/lib/format-date";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { RowListInput } from "@/components/RowListInput";
import { ReworkBanner } from "@/components/TestCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type RoadmapSource = "repo" | "approved";

// Yol haritası önce senkronlanmış repodaki docs/roadmap.md'den (geliştirirken
// "- [x]" işaretlenmiş olabilir), yoksa onaylı planlama belgesinden okunur.
function roadmapFrom(
  repo: RepoState | null,
  documents: TaskDocument[],
): { source: RoadmapSource | null; items: RoadmapItem[] } {
  const repoContent = repo?.files.find((f) => f.path === DOCUMENT_REPO_PATHS.roadmap)?.content;
  if (repoContent) return { source: "repo", items: parseRoadmap(repoContent) };
  const approved = documents.find((d) => d.kind === "roadmap")?.content;
  if (approved) return { source: "approved", items: parseRoadmap(approved) };
  return { source: null, items: [] };
}

// "Geliştirildi" formu: yol haritasında neler bitti, eksik kalan ve fazladan
// eklenen özellikler, kısa notlar. Gönderilince fikir "Test bekliyor"a geçer.
export function DevReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [documents, setDocuments] = useState<TaskDocument[]>([]);
  const [repo, setRepo] = useState<RepoState | null>(null);
  const [latest, setLatest] = useState<DevReport | null>(null);
  const [testRounds, setTestRounds] = useState<TestRound[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [source, setSource] = useState<RoadmapSource | null>(null);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchIdea(id), fetchIdeaTask(id), fetchDevReports(id), fetchTestRounds(id)])
      .then(([ideaRes, taskRes, reportsRes, roundsRes]) => {
        setTestRounds(roundsRes.rounds);
        setIdea(ideaRes.idea);
        setTask(taskRes.task);
        setDocuments(taskRes.documents);
        setRepo(taskRes.repo);
        const last = reportsRes.reports[0] ?? null;
        setLatest(last);

        // "Test bekliyor"dan geri alınmış bir fikirde son rapor güncellenecek:
        // form o raporla dolu açılır. Testten dönmüşte (rework) yeni tur, boş form.
        if (ideaRes.idea.status === "in_development" && last) {
          setSource(last.roadmap_source);
          setItems(last.roadmap_items);
          setMissing(last.missing_features);
          setExtra(last.extra_features);
          setNotes(last.notes);
        } else {
          const roadmap = roadmapFrom(taskRes.repo, taskRes.documents);
          setSource(roadmap.source);
          setItems(roadmap.items);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
  }, [id]);

  const groups = useMemo(() => groupByPhase(items.map((item, index) => ({ ...item, index }))), [items]);
  const doneCount = items.filter((i) => i.done).length;

  function toggle(index: number, done: boolean) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, done } : item)));
  }

  function setPhase(phase: string | null, done: boolean) {
    setItems((prev) => prev.map((item) => (item.phase === phase ? { ...item, done } : item)));
  }

  // Senkron sonrası liste repodan yeniden okunur; elle işaretlenenler korunur.
  async function handleSync() {
    if (!task) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await syncTaskRepo(task.id);
      setRepo(res.repo);
      const roadmap = roadmapFrom(res.repo, documents);
      const manuallyDone = new Set(items.filter((i) => i.done).map((i) => i.text));
      setSource(roadmap.source);
      setItems(roadmap.items.map((item) => ({ ...item, done: item.done || manuallyDone.has(item.text) })));
    } catch (err) {
      setSyncError(`Senkronlanamadı: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubmit() {
    if (!id) return;
    setSubmitError(null);
    try {
      await submitDevReport(id, {
        roadmap_source: source,
        roadmap_items: items,
        missing_features: missing.map((v) => v.trim()).filter(Boolean),
        extra_features: extra.map((v) => v.trim()).filter(Boolean),
        notes: notes.map((v) => v.trim()).filter(Boolean),
      });
      navigate(`/ideas/${id}`);
    } catch (err) {
      setSubmitError(`Gönderilemedi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const backLink = (
    <Link
      to={id ? `/ideas/${id}` : "/developed"}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Fikre dön
    </Link>
  );

  if (!loaded) return <PageMessage>Yükleniyor…</PageMessage>;
  if (loadError || !idea) return <PageMessage tone="error">Fikir yüklenemedi: {loadError}</PageMessage>;

  const allowed = (idea.status === "in_development" || idea.status === "rework") && task?.status === "done";
  if (!allowed) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <PageHeader title={`Geliştirildi — ${idea.name}`} />
        <PageMessage>
          Bu form yalnızca iskeleti hazır, geliştirme aşamasındaki (ya da testten dönmüş) bir fikir için açılır.
        </PageMessage>
      </div>
    );
  }

  const isUpdate = idea.status === "in_development" && latest != null;
  const lastTestRound = Math.max(0, ...testRounds.filter((r) => r.status !== "cancelled").map((r) => r.round));
  const round = isUpdate ? latest.round : Math.max(latest?.round ?? 0, lastTestRound) + 1;
  const lastSync = repo?.last_sync ?? null;

  return (
    <div className="flex flex-col gap-5">
      {backLink}
      <PageHeader
        title={`Geliştirildi — ${idea.name}`}
        description={
          <>
            {round}. tur geliştirme raporu{isUpdate ? " (son raporun üzerine yazılır)" : ""}. Gönderince fikir{" "}
            <span className="font-medium">Test bekliyor</span> durumuna geçer.
          </>
        }
      />

      {idea.status === "rework" && <ReworkBanner rounds={testRounds} />}

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">
              Yol haritası · {doneCount}/{items.length} tamamlandı
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Senkronlanıyor…" : "Repoyla senkronla"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {source === "repo"
              ? `Repodaki docs/roadmap.md'den okundu (son senkron ${lastSync ? formatDateTime(lastSync.synced_at) : "—"}). Repoda işaretlenmiş görevler işaretli gelir.`
              : source === "approved"
                ? "Onaylı yol haritası belgesinden okundu. Repoda işaretlediğin görevleri almak için önce senkronla."
                : "Yol haritası bulunamadı."}
          </p>
          {syncError && <p className="text-sm break-words text-destructive">{syncError}</p>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Yol haritasında "- [ ]" biçiminde görev bulunamadı.</p>
          ) : (
            groups.map((group) => {
              const allDone = group.items.every((i) => i.done);
              return (
                <div key={`${group.phase}-${group.items[0].index}`} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{group.phase ?? "Görevler"}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPhase(group.phase, !allDone)}
                    >
                      {allDone ? "Tümünü kaldır" : "Tümünü işaretle"}
                    </Button>
                  </div>
                  {group.items.map((item) => {
                    const checkboxId = `roadmap-${item.index}`;
                    return (
                      <div key={item.index} className="flex items-start gap-2">
                        <Checkbox
                          id={checkboxId}
                          checked={item.done}
                          onCheckedChange={(value) => toggle(item.index, value === true)}
                          className="mt-0.5"
                        />
                        <Label htmlFor={checkboxId} className="leading-snug font-normal">
                          {item.text}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Eksik kalan özellikler</CardTitle>
          <p className="text-xs text-muted-foreground">Planlanıp yapılmayanlar ya da yarım kalanlar.</p>
        </CardHeader>
        <CardContent>
          <RowListInput
            values={missing}
            onChange={setMissing}
            placeholder="Eksik kalan bir özellik…"
            suggestions={task?.params.mvp_features ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Fazladan eklenenler</CardTitle>
          <p className="text-xs text-muted-foreground">Planda olmayıp eklenen özellikler.</p>
        </CardHeader>
        <CardContent>
          <RowListInput values={extra} onChange={setExtra} placeholder="Fazladan eklenen bir özellik…" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Notlar</CardTitle>
          <p className="text-xs text-muted-foreground">Kısa maddeler: ne oldu, neye dikkat etmeli, test için ipuçları…</p>
        </CardHeader>
        <CardContent>
          <RowListInput values={notes} onChange={setNotes} placeholder="Kısa bir not…" />
        </CardContent>
      </Card>

      {submitError && <PageMessage tone="error">{submitError}</PageMessage>}

      <div className="flex flex-wrap gap-3">
        <ConfirmButton
          label="Geliştirildi, teste gönder"
          title="Raporu gönder ve teste al?"
          description={`${round}. tur raporu kaydedilir, fikir Test ekranına "Test bekliyor" olarak geçer.`}
          confirmLabel="Gönder"
          variant="default"
          onConfirm={handleSubmit}
        />
        <Button type="button" variant="outline" onClick={() => navigate(`/ideas/${id}`)}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
