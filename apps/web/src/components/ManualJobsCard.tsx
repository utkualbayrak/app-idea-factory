import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Combine, FileText, Hammer, Lightbulb, RefreshCw, Search, Sparkles } from "lucide-react";
import {
  createTask,
  fetchIdeas,
  fetchIdeaTask,
  fetchWorkflowRuns,
  startBuild,
  syncTaskRepo,
  type Idea,
  type IdeaWorkflow,
  type Task,
  type WorkflowRun,
} from "@/lib/api";
import { WorkflowTriggerButton } from "@/components/WorkflowTriggerButton";
import { CronJobControl } from "@/components/CronJobControl";
import { isRunActive } from "@/lib/activity";
import { LastRunLine } from "@/components/LastRunLine";
import { ConfirmButton } from "@/components/ConfirmButton";
import { isInIdeaPool, STATUS_LABELS } from "@/lib/idea-colors";
import { REPLANNABLE_STATUSES, TASK_STATUS_LABELS } from "@/lib/task-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

const SUCCESS = "Tetiklendi — birkaç dakika içinde Çalışma geçmişi'nde görünecek.";

// Bir işin satırı: başlık, ne yaptığı, buton ve (varsa) neden kapalı olduğu.
function JobRow({
  title,
  description,
  disabledReason,
  children,
}: {
  title: string;
  description: string;
  disabledReason?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {disabledReason && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{disabledReason}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:max-w-xs sm:items-end">{children}</div>
    </div>
  );
}

// Workflow dışı aksiyonlar (görev uçları, repo senkronu) için WorkflowTriggerButton benzeri buton.
function ActionButton({
  label,
  icon,
  disabled,
  confirm,
  run,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  /** Varsa önce onay sorulur (repo oluşturan işler gibi). */
  confirm?: { title: string; description: string };
  run: () => Promise<string>;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handle() {
    setLoading(true);
    setMessage(null);
    try {
      setMessage(await run());
    } catch (err) {
      setMessage(`Başarısız: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <>
      {icon}
      {loading ? "Çalışıyor…" : label}
    </>
  );
  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      {confirm ? (
        <ConfirmButton
          label={content}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={label}
          className="w-fit"
          disabled={disabled || loading}
          onConfirm={handle}
        />
      ) : (
        <Button variant="outline" className="w-fit" disabled={disabled || loading} onClick={handle}>
          {content}
        </Button>
      )}
      {message && <p className="text-sm text-muted-foreground sm:text-right">{message}</p>}
    </div>
  );
}

// Ayarlar > İşleri elle çalıştır: deploy dışındaki tüm workflow'lar ve
// Claude'suz görev aksiyonları tek yerde. Fikir bazlı işler seçilen fikre
// göre açılır/kapanır; kapalıysa nedeni yazılır.
export function ManualJobsCard() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch(() => setIdeas([]));
  }, []);

  const loadSelected = useCallback(() => {
    if (!selectedId) return;
    fetchIdeaTask(selectedId)
      .then((res) => setTask(res.task))
      .catch(() => setTask(null));
    fetchWorkflowRuns({ ideaId: selectedId, limit: 20 })
      .then((res) => setRuns(res.runs))
      .catch(() => setRuns([]));
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch(() => {});
  }, [selectedId]);

  useEffect(loadSelected, [loadSelected]);

  // Seçili fikir için sırada/çalışan bir iş varsa bitene kadar yokla: buton
  // kilidi ve "Son" satırı kendiliğinden güncellensin.
  const anyActive = runs.some((run) => isRunActive(run));
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(loadSelected, 15_000);
    return () => clearInterval(timer);
  }, [anyActive, loadSelected]);

  function handleSelect(id: string) {
    setTask(null);
    setRuns([]);
    setSelectedId(id);
  }

  const groups = useMemo(() => {
    const sorted = [...(ideas ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return [
      { label: "Fikirler", items: sorted.filter((i) => isInIdeaPool(i.status)) },
      { label: "Geliştirme, test ve dağıtım", items: sorted.filter((i) => !isInIdeaPool(i.status)) },
    ].filter((g) => g.items.length > 0);
  }, [ideas]);

  const idea = ideas?.find((i) => i.id === selectedId) ?? null;
  const lastRun = (workflow: IdeaWorkflow) => runs.find((run) => run.workflow === workflow);
  const running = (workflow: IdeaWorkflow) => isRunActive(lastRun(workflow));
  const inputs = idea ? { idea_id: idea.id } : undefined;

  const reevaluateBlock = !idea
    ? null
    : !idea.scores
      ? "Fikir henüz puanlanmadı; önce Claude ile değerlendir."
      : !idea.user_note
        ? "Fikirde not yok; yeniden değerlendirme notu kanıt olarak kullanır."
        : null;
  const planBlock = !idea
    ? null
    : !task
      ? "Bu fikir için görev formu doldurulmamış; ilk planlama detay sayfasındaki \"Geliştir\" ile başlar."
      : !REPLANNABLE_STATUSES.includes(task.status)
        ? `Görev "${TASK_STATUS_LABELS[task.status]}" durumunda; belgeler yalnızca hazırlanamadığında ya da onay beklerken yeniden üretilebilir.`
        : null;
  const buildBlock = !idea
    ? null
    : !task
      ? "Bu fikir için görev yok."
      : task.status !== "ready" && task.status !== "failed"
        ? `Görev "${TASK_STATUS_LABELS[task.status]}" durumunda; iskelet yalnızca belgeler hazırken ya da önceki deneme başarısızsa kurulur.`
        : null;
  const syncBlock = !idea ? null : !task?.repo_url ? "Bu fikrin henüz skeleton reposu yok." : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">İşleri elle çalıştır</CardTitle>
        <p className="text-sm text-muted-foreground">
          Zamanlanmış ya da butonla başlayan işlerin hepsi buradan da tetiklenebilir (deploy hariç). Sonuçlar{" "}
          <Link to="/cron-runs" className="text-primary underline underline-offset-4">
            Çalışma geçmişi
          </Link>
          'nde.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Genel işler</h3>
          <JobRow
            title="Günlük fikir üretimi"
            description="Trendleri toplar, Claude 10 yeni fikir üretir. Her gün 06:00'da kendiliğinden çalışır."
          >
            <CronJobControl
              kind="daily"
              workflow="daily-ideas.yml"
              label="Şimdi çalıştır"
              icon={<Lightbulb className="size-4" />}
            />
          </JobRow>
          <JobRow
            title="Havuz bakımı"
            description="Benzer fikirleri birleştirir, geliştirmedekilere özellik önerir. Her gün 07:00'de kontrol eder, aralık dolduysa çalışır; buradan aralık beklenmeden çalışır."
          >
            <CronJobControl
              kind="merge"
              workflow="merge-ideas.yml"
              label="Şimdi çalıştır"
              inputs={{ force: "true" }}
              icon={<Combine className="size-4" />}
            />
          </JobRow>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fikir işleri</h3>
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger className="w-full sm:max-w-sm">
              <SelectValue placeholder={ideas ? "Bir fikir seç…" : "Fikirler yükleniyor…"} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {groups.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      <span className="text-muted-foreground"> · {STATUS_LABELS[item.status]}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {idea && (
            <div className="flex flex-col gap-4 rounded-md border p-4">
              <p className="text-sm">
                <Link to={`/ideas/${idea.id}`} className="font-medium text-primary underline underline-offset-4">
                  {idea.name}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {STATUS_LABELS[idea.status]}
                  {task && ` · görev: ${TASK_STATUS_LABELS[task.status]}`}
                </span>
              </p>
              <JobRow
                title="Claude ile değerlendir"
                description="Fikri günlük fikirlerle aynı ölçütlerle puanlar; açıklamayla girilmiş ve doldurulmamışsa önce alanları doldurur."
              >
                <WorkflowTriggerButton
                  label="Değerlendir"
                  loadingLabel="Tetikleniyor…"
                  successMessage={SUCCESS}
                  workflow="evaluate-idea.yml"
                  inputs={inputs}
                  disabled={running("evaluate-idea.yml")}
                  icon={<Sparkles className="size-4" />}
                  onTriggered={loadSelected}
                />
                <LastRunLine run={lastRun("evaluate-idea.yml")} label="Son" />
              </JobRow>
              <JobRow
                title="Notlarla yeniden değerlendir"
                description="Notunu kanıt olarak tartıp puanları yeniden verir."
                disabledReason={reevaluateBlock}
              >
                <WorkflowTriggerButton
                  label="Yeniden değerlendir"
                  loadingLabel="Tetikleniyor…"
                  successMessage={SUCCESS}
                  workflow="reevaluate-idea.yml"
                  inputs={inputs}
                  disabled={reevaluateBlock != null || running("reevaluate-idea.yml")}
                  icon={<Sparkles className="size-4" />}
                  onTriggered={loadSelected}
                />
                <LastRunLine run={lastRun("reevaluate-idea.yml")} label="Son" />
              </JobRow>
              <JobRow title="Rakipleri bul" description="Web'de gerçek, benzer uygulamaları arar; öncekilerin yerine yazar.">
                <WorkflowTriggerButton
                  label="Rakipleri bul"
                  loadingLabel="Tetikleniyor…"
                  successMessage={SUCCESS}
                  workflow="find-competitors.yml"
                  inputs={inputs}
                  disabled={running("find-competitors.yml")}
                  icon={<Search className="size-4" />}
                  onTriggered={loadSelected}
                />
                <LastRunLine run={lastRun("find-competitors.yml")} label="Son" />
              </JobRow>
              <JobRow
                title="Planlama belgelerini yeniden üret"
                description="Görev formundaki mevcut seçimlerle 4 belgeyi (PRD, ekranlar, teknik plan, yol haritası) baştan yazar; senin düzenlemelerin gider."
                disabledReason={planBlock}
              >
                <ActionButton
                  label="Yeniden üret"
                  icon={<FileText className="size-4" />}
                  disabled={planBlock != null}
                  confirm={{
                    title: "Belgeleri yeniden üret?",
                    description: "Mevcut 4 belge, senin düzenlemelerin dahil, Claude'un yeni yazdıklarıyla değiştirilecek.",
                  }}
                  run={async () => {
                    await createTask(idea.id, task!.params);
                    loadSelected();
                    return SUCCESS;
                  }}
                />
                <LastRunLine run={lastRun("plan-idea.yml")} label="Son" />
              </JobRow>
              <JobRow
                title={task?.status === "failed" ? "İskeleti tekrar dene" : "İskeleti kur"}
                description="Onaylı belgelerle özel repo ve issue oluşturur, Claude iskeleti yazar. Tekrar denemede aynı repo kullanılır."
                disabledReason={buildBlock}
              >
                <ActionButton
                  label={task?.status === "failed" ? "Tekrar dene" : "İskeleti kur"}
                  icon={<Hammer className="size-4" />}
                  disabled={buildBlock != null}
                  confirm={{
                    title: "İskelet kurulumunu başlat?",
                    description: "Fikir Geliştiriliyor'a geçer, belgeler kilitlenir; ilk kurulumda GitHub'da yeni özel bir repo açılır.",
                  }}
                  run={async () => {
                    await startBuild(task!.id);
                    loadSelected();
                    return SUCCESS;
                  }}
                />
                <LastRunLine run={lastRun("build-skeleton.yml")} label="Son" />
              </JobRow>
              <JobRow
                title="Repoyu senkronla"
                description="Skeleton reposundaki son commit'leri ve değişen Markdown dosyalarını çeker (Claude çalışmaz)."
                disabledReason={syncBlock}
              >
                <ActionButton
                  label="Senkronla"
                  icon={<RefreshCw className="size-4" />}
                  disabled={syncBlock != null}
                  run={async () => {
                    const { repo } = await syncTaskRepo(task!.id);
                    const changes = repo.last_sync?.changes.length ?? 0;
                    return `Senkronlandı — ${changes} değişen dosya.`;
                  }}
                />
              </JobRow>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
