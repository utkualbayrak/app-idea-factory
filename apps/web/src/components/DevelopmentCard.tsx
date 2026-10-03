import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, Eye, Pencil, RotateCcw } from "lucide-react";
import {
  patchIdea,
  patchTaskDocument,
  startBuild,
  type DocumentKind,
  type IdeaStatus,
  type RepoFile,
  type RepoState,
  type Task,
  type TaskDocument,
  type WorkflowRun,
} from "@/lib/api";
import {
  designSummary,
  AUTH_LABELS,
  BACKEND_LABELS,
  DOCUMENT_LABELS,
  DOCUMENT_REPO_PATHS,
  PLATFORM_LABELS,
  REPLANNABLE_STATUSES,
  TARGET_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/task-labels";
import { formatDateTime } from "@/lib/format-date";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DiffView } from "@/components/DiffView";
import { RepoSyncPanel } from "@/components/RepoSyncPanel";
import { SegmentedControl } from "@/components/SegmentedControl";
import { IdeaStatusBadge } from "@/components/IdeaStatusBadge";
import { COMMIT_DATE_STATUSES } from "@/lib/idea-colors";
import { LastRunLine } from "@/components/LastRunLine";
import { Markdown } from "@/components/Markdown";
import { ExportMenu } from "@/components/ExportMenu";
import { documentsToMarkdown, exportFileName } from "@/lib/export-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUserNames } from "@/lib/user-names";
import { UpdatedBy } from "@/components/UpdatedBy";

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
  /** Dışa aktarılan dosyaların adı ve başlığı için. */
  ideaName: string;
  ideaStatus: IdeaStatus;
  task: Task;
  documents: TaskDocument[];
  lastPlanRun: WorkflowRun | undefined;
  lastBuildRun: WorkflowRun | undefined;
  /** İskelet reposunun son senkronu (yoksa null). */
  repo: RepoState | null;
  onRepoSynced: (repo: RepoState) => void;
  /** Görev/fikir/iş listesi sunucudan tazelensin (başlatma, işaretleme sonrası). */
  onChanged: () => void;
}

// Fikir detayındaki "Geliştirme" kartı: görev parametreleri, durum,
// Claude'un yazdığı planlama belgeleri (görev 'ready' iken düzenlenebilir),
// "Geliştirmeye başla" / "Tekrar dene" ve iskelet repo/issue linkleri.
export function DevelopmentCard({
  ideaId,
  ideaName,
  ideaStatus,
  task,
  documents,
  lastPlanRun,
  lastBuildRun,
  repo,
  onRepoSynced,
  onChanged,
}: DevelopmentCardProps) {
  const { params } = task;
  const canReplan = REPLANNABLE_STATUSES.includes(task.status);
  const editable = task.status === "ready";

  // Sekmeler arası geçişte kaybolmasın diye taslaklar kartta tutulur
  // (Radix Tabs pasif sekmenin içeriğini unmount ediyor).
  const [savedDocs, setSavedDocs] = useState<Partial<Record<DocumentKind, TaskDocument>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<DocumentKind, string>>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  // Kaydedilen belge, sunucu tekrar yüklenene kadar yerel kopyadan gösterilir.
  const docs = documents.map((doc) => {
    const saved = savedDocs[doc.kind];
    return saved && saved.user_edited_at && (!doc.user_edited_at || saved.user_edited_at > doc.user_edited_at) ? saved : doc;
  });
  const dirtyKinds = docs.filter((doc) => drafts[doc.kind] != null && drafts[doc.kind] !== doc.content).map((d) => d.kind);

  // Repo senkronu: plan belgelerinin repodaki karşılıkları, docs/ altındaki
  // diğer md'ler (ek sekme) ve son senkronda değişenler (sekmede nokta).
  const repoFiles = repo?.files ?? [];
  const planPaths = new Set(Object.values(DOCUMENT_REPO_PATHS));
  const extraDocs = repoFiles.filter((f) => f.path.startsWith("docs/") && !planPaths.has(f.path));
  const changedPaths = new Set(
    repo?.last_sync?.previous_head_sha
      ? repo.last_sync.changes.filter((c) => c.change !== "removed").map((c) => c.path)
      : [],
  );
  const repoFileFor = (kind: DocumentKind) => repoFiles.find((f) => f.path === DOCUMENT_REPO_PATHS[kind]);

  function setDraft(kind: DocumentKind, value: string | undefined) {
    setDrafts((prev) => ({ ...prev, [kind]: value }));
  }

  async function saveDocument(kind: DocumentKind, content: string) {
    const res = await patchTaskDocument(task.id, kind, content);
    setSavedDocs((prev) => ({ ...prev, [kind]: res.document }));
    setDraft(kind, undefined);
  }

  async function handleBuild() {
    setActionError(null);
    try {
      await startBuild(task.id);
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(
        message.includes("HTTP 500")
          ? `Başlatılamadı: ${message}. GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı eklenmemiş olabilir.`
          : `Başlatılamadı: ${message}`,
      );
      onChanged();
    }
  }

  async function handleMarkStatus(status: "in_development") {
    setActionError(null);
    try {
      await patchIdea(ideaId, { status });
      onChanged();
    } catch (err) {
      setActionError(`Durum değiştirilemedi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card id="gelistirme" className="min-w-0 scroll-mt-44">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Geliştirme</CardTitle>
        {task.status === "done" && COMMIT_DATE_STATUSES.includes(ideaStatus) ? (
          <IdeaStatusBadge idea={{ id: ideaId, status: ideaStatus }} />
        ) : (
          <Badge className={TASK_STATUS_STYLES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
        )}
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <UpdatedBy by={task.updated_by} at={task.updated_at} className="-mt-2" />
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{PLATFORM_LABELS[params.platform]}</dd>
          <dt className="text-muted-foreground">Hedefler</dt>
          <dd>{params.targets.map((t) => TARGET_LABELS[t]).join(", ")}</dd>
          <dt className="text-muted-foreground">Backend</dt>
          <dd>{BACKEND_LABELS[params.backend]}</dd>
          <dt className="text-muted-foreground">Kimlik doğrulama</dt>
          <dd>{AUTH_LABELS[params.auth]}</dd>
          <dt className="text-muted-foreground">Tasarım</dt>
          <dd>
            {designSummary(params.design)}
            {params.design.references && (
              <span className="block text-muted-foreground">Referans: {params.design.references}</span>
            )}
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

        {(task.repo_url || task.issue_url) && (
          <div className="flex flex-wrap gap-2">
            {task.repo_url && (
              <Button asChild variant="outline" size="sm">
                <a href={task.repo_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Repo
                </a>
              </Button>
            )}
            {task.issue_url && (
              <Button asChild variant="outline" size="sm">
                <a href={task.issue_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Issue
                </a>
              </Button>
            )}
          </div>
        )}

        {task.repo_url && <RepoSyncPanel taskId={task.id} repo={repo} onSynced={onRepoSynced} />}

        <StatusMessage task={task} />

        {docs.length > 0 && (
          <div className="flex justify-end">
            <ExportMenu
              size="sm"
              label="Tüm belgeleri dışa aktar"
              fileName={exportFileName(ideaName, "belgeler")}
              getContent={() => documentsToMarkdown(ideaName, docs, repo)}
            />
          </div>
        )}
        {docs.length > 0 && (
          <Tabs defaultValue={docs[0].kind} className="min-w-0">
            {/* Mobilde dört sekme sığmazsa satır kendi içinde kayar. */}
            <div className="overflow-x-auto">
              <TabsList>
                {docs.map((doc) => (
                  <TabsTrigger key={doc.kind} value={doc.kind}>
                    {DOCUMENT_LABELS[doc.kind]}
                    {dirtyKinds.includes(doc.kind) && (
                      <span className="size-1.5 rounded-full bg-amber-500" aria-label="kaydedilmemiş" />
                    )}
                    {changedPaths.has(DOCUMENT_REPO_PATHS[doc.kind]) && (
                      <span className="size-1.5 rounded-full bg-sky-500" aria-label="repoda değişti" />
                    )}
                  </TabsTrigger>
                ))}
                {extraDocs.map((file) => (
                  <TabsTrigger key={file.path} value={`repo:${file.path}`}>
                    {file.path.slice("docs/".length).replace(/\.md$/i, "")}
                    {changedPaths.has(file.path) && (
                      <span className="size-1.5 rounded-full bg-sky-500" aria-label="repoda değişti" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {docs.map((doc) => (
              <TabsContent key={doc.kind} value={doc.kind} className="min-w-0 rounded-md border p-4">
                <DocumentPanel
                  doc={doc}
                  fileName={exportFileName(ideaName, DOCUMENT_REPO_PATHS[doc.kind].slice("docs/".length, -".md".length))}
                  repoFile={repoFileFor(doc.kind)}
                  editable={editable}
                  draft={drafts[doc.kind]}
                  onDraftChange={(value) => setDraft(doc.kind, value)}
                  onSave={(content) => saveDocument(doc.kind, content)}
                />
              </TabsContent>
            ))}
            {extraDocs.map((file) => (
              <TabsContent key={file.path} value={`repo:${file.path}`} className="min-w-0 rounded-md border p-4">
                <RepoDocPanel
                  file={file}
                  fileName={exportFileName(ideaName, file.path.slice("docs/".length).replace(/\.md$/i, ""))}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {task.status === "ready" && (
            <ConfirmButton
              label="Geliştirmeye başla"
              title="İskelet üretimini başlat?"
              description="Belgeler kilitlenir. Özel bir GitHub reposu ve issue açılır, Claude Code bu belgelere göre iskeleti kurar (genelde 15-45 dakika). Fikir 'Geliştiriliyor' durumuna geçer."
              confirmLabel="Başlat"
              variant="default"
              disabled={dirtyKinds.length > 0}
              onConfirm={handleBuild}
            />
          )}
          {task.status === "failed" && (
            <ConfirmButton
              label={
                <>
                  <RotateCcw className="size-4" />
                  Tekrar dene
                </>
              }
              title="İskelet üretimini tekrar dene?"
              description="Aynı repo, aynı issue ve aynı belgelerle baştan çalışır; repodaki önceki deneme içeriğinin yerine yenisi yazılır."
              confirmLabel="Tekrar dene"
              variant="default"
              onConfirm={handleBuild}
            />
          )}
          {canReplan && (
            <Button asChild variant="outline">
              <Link to={`/ideas/${ideaId}/develop`}>
                {task.status === "planning_failed" ? <RotateCcw className="size-4" /> : <Pencil className="size-4" />}
                {task.status === "planning_failed" ? "Parametreleri düzenle ve tekrar dene" : "Parametreleri düzenle, yeniden üret"}
              </Link>
            </Button>
          )}
          {task.status === "done" && (ideaStatus === "in_development" || ideaStatus === "rework") && (
            <Button asChild>
              <Link to={`/ideas/${ideaId}/developed`}>
                <CheckCircle2 className="size-4" />
                Geliştirildi
              </Link>
            </Button>
          )}
          {ideaStatus === "awaiting_test" && (
            <ConfirmButton
              label="Geliştiriliyor'a geri al"
              title="Fikri tekrar 'Geliştiriliyor' yap?"
              description="Fikir Geliştirilenler ekranına döner. Geliştirme raporu kalır; tekrar 'Geliştirildi' dediğinde aynı raporu güncellersin."
              confirmLabel="Geri al"
              onConfirm={() => handleMarkStatus("in_development")}
            />
          )}
        </div>
        {task.status === "ready" && dirtyKinds.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Kaydedilmemiş değişiklikler var — başlatmadan önce kaydet ya da vazgeç.
          </p>
        )}
        {actionError && <p className="text-sm break-words text-destructive">{actionError}</p>}

        <div className="flex flex-col gap-1">
          <LastRunLine run={lastPlanRun} label="Son belge üretimi" />
          <LastRunLine run={lastBuildRun} label="Son iskelet üretimi" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusMessage({ task }: { task: Task }) {
  switch (task.status) {
    case "planning":
      return (
        <p className="text-sm text-muted-foreground">
          Claude planlama belgelerini yazıyor — genelde birkaç dakika sürer, bu sayfa kendini yeniler.
        </p>
      );
    case "ready":
      return (
        <p className="text-sm text-muted-foreground">
          Belgeleri incele, gerekirse düzenle. Hazır olduğunda "Geliştirmeye başla" ile iskelet kurulur; iskelet yalnızca
          bu belgelere bakılarak kurulacak.
        </p>
      );
    case "queued":
    case "running":
      return (
        <p className="text-sm text-muted-foreground">
          İskelet kuruluyor — genelde 15-45 dakika sürer, bu sayfa kendini yeniler. Belgeler bu aşamada kilitli.
        </p>
      );
    case "done":
      return (
        <p className="text-sm text-muted-foreground">
          İskelet hazır — kurulum ve mimari için reponun README'sine, Claude'un özeti için issue'ya bak. Geliştirmeyi
          bitirdiğinde "Geliştirildi" formuyla neyin yapıldığını kaydedip fikri teste gönderebilirsin.
        </p>
      );
    case "planning_failed":
    case "failed":
      return task.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm break-words text-red-800 dark:bg-red-950 dark:text-red-200">
          {task.error}
        </p>
      ) : null;
    default:
      return null;
  }
}

// docs/ altında plan belgeleri dışında kalan, repoda sonradan eklenmiş md.
function RepoDocPanel({ file, fileName }: { file: RepoFile; fileName: string }) {
  const [view, setView] = useState<"content" | "diff">("content");
  const hasDiff = file.content != null && file.previous_content != null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Repoda · ilk görüldü {formatDateTime(file.first_seen_at)}
          {file.changed_at !== file.first_seen_at && ` · son değişiklik ${formatDateTime(file.changed_at)}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasDiff && (
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: "content", label: "İçerik" },
              { value: "diff", label: "Fark (önceki senkron)" },
            ]}
          />
          )}
          {file.content != null && (
            <ExportMenu size="sm" fileName={fileName} getContent={() => file.content ?? ""} />
          )}
        </div>
      </div>
      {file.content == null ? (
        <p className="text-sm text-muted-foreground">Dosya çok büyük, içeriği çekilmedi — repoda görüntüle.</p>
      ) : view === "diff" && file.previous_content != null ? (
        <DiffView oldText={file.previous_content} newText={file.content} />
      ) : (
        <Markdown>{file.content}</Markdown>
      )}
    </div>
  );
}

function DocumentPanel({
  doc,
  fileName,
  repoFile,
  editable,
  draft,
  onDraftChange,
  onSave,
}: {
  doc: TaskDocument;
  fileName: string;
  repoFile: RepoFile | undefined;
  editable: boolean;
  draft: string | undefined;
  onDraftChange: (value: string | undefined) => void;
  onSave: (content: string) => Promise<void>;
}) {
  const { displayName } = useUserNames();
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft != null;
  // Repo senkronlandıysa ve repodaki sürüm onaylıdan farklıysa varsayılan
  // görünüm repodaki (en güncel) sürüm; onaylı ve fark da seçilebilir.
  const repoContent = repoFile?.content ?? null;
  const repoDiffers = repoContent != null && repoContent.trim() !== doc.content.trim();
  const [view, setView] = useState<"repo" | "approved" | "diff">("repo");

  async function handleSave() {
    if (draft == null) return;
    if (!draft.trim()) {
      setError("Belge boş olamaz.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setPreview(false);
    } catch (err) {
      setError(`Kaydedilemedi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Üretildi: {formatDateTime(doc.generated_at)}
          {doc.user_edited_at && ` · Son düzenleme: ${formatDateTime(doc.user_edited_at)}`}
          {doc.user_edited_at && doc.edited_by && ` (${displayName(doc.edited_by)})`}
          {repoFile && (repoDiffers ? " · Repoda değiştirilmiş" : " · Repodaki sürümle aynı")}
        </p>
        {repoDiffers && !editing && (
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: "repo", label: "Repodaki" },
              { value: "approved", label: "Onaylı" },
              { value: "diff", label: "Fark" },
            ]}
          />
        )}
        <ExportMenu
          size="sm"
          fileName={fileName}
          getContent={() => draft ?? (repoDiffers && view !== "approved" && repoContent != null ? repoContent : doc.content)}
        />
        {editable && !editing && (
          <Button variant="outline" size="sm" onClick={() => onDraftChange(doc.content)}>
            <Pencil className="size-4" />
            Düzenle
          </Button>
        )}
        {editing && (
          <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />}
            {preview ? "Düzenle" : "Önizle"}
          </Button>
        )}
      </div>

      {editing && !preview ? (
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={24}
          className="min-h-96 font-mono text-xs leading-relaxed"
          aria-label="Belge içeriği (Markdown)"
        />
      ) : editing ? (
        <Markdown>{draft}</Markdown>
      ) : repoDiffers && view === "diff" ? (
        <DiffView oldText={doc.content} newText={repoContent} />
      ) : (
        <Markdown>{repoDiffers && view === "repo" ? repoContent : doc.content}</Markdown>
      )}

      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={saving || draft === doc.content}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onDraftChange(undefined);
              setPreview(false);
              setError(null);
            }}
            disabled={saving}
          >
            Vazgeç
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
