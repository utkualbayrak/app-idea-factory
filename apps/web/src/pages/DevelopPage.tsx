import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, X } from "lucide-react";
import {
  createTask,
  fetchIdea,
  fetchIdeaTask,
  type Idea,
  type Task,
  type TaskAuth,
  type TaskBackend,
  type TaskDensity,
  type TaskGamification,
  type TaskParams,
  type TaskPlatform,
  type TaskStyle,
  type TaskTarget,
  type TaskTheme,
} from "@/lib/api";
import {
  AUTH_LABELS,
  BACKEND_LABELS,
  DENSITY_LABELS,
  FIXED_TARGETS,
  GAMIFICATION_LABELS,
  PLATFORM_LABELS,
  REPLANNABLE_STATUSES,
  STYLE_DESCRIPTIONS,
  STYLE_LABELS,
  TARGET_LABELS,
  TASK_STATUS_LABELS,
  THEME_LABELS,
} from "@/lib/task-labels";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const MAX_FEATURES = 10;
// Expo/Flutter'da seçilebilen hedefler, gösterim sırasıyla.
const CROSS_PLATFORM_TARGETS: TaskTarget[] = ["ios", "android", "web"];
const SUGGESTED_MIN = 3;
const SUGGESTED_MAX = 5;

const DEFAULT_PARAMS: Omit<TaskParams, "mvp_features"> = {
  platform: "expo",
  targets: ["ios", "android"],
  backend: "none",
  auth: "none",
  design: { theme: "both", style: "minimal", gamification: "none", density: "balanced" },
  notes: "",
};

// "Geliştir" görev formu (docs/PROJE.md "Görev formu alanları"). Gönderilince
// fikir "Geliştirme bekliyor"a geçer ve Claude planlama belgelerini yazar.
// Belgeler hazır olduktan (veya üretim başarısız olduktan) sonra form, mevcut
// parametrelerle dolu açılır ve belgeleri yeniden üretmek için kullanılır.
export function DevelopPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [platform, setPlatform] = useState<TaskPlatform>(DEFAULT_PARAMS.platform);
  // Çapraz platformda seçilen hedefler; native seçildiğinde FIXED_TARGETS geçerli.
  const [targets, setTargets] = useState<TaskTarget[]>(DEFAULT_PARAMS.targets);
  const [backend, setBackend] = useState<TaskBackend>(DEFAULT_PARAMS.backend);
  const [auth, setAuth] = useState<TaskAuth>(DEFAULT_PARAMS.auth);
  const [theme, setTheme] = useState<TaskTheme>(DEFAULT_PARAMS.design.theme);
  const [style, setStyle] = useState<TaskStyle>(DEFAULT_PARAMS.design.style);
  const [gamification, setGamification] = useState<TaskGamification>(DEFAULT_PARAMS.design.gamification);
  const [density, setDensity] = useState<TaskDensity>(DEFAULT_PARAMS.design.density);
  const [references, setReferences] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchIdea(id), fetchIdeaTask(id)])
      .then(([ideaRes, taskRes]) => {
        const loadedIdea = ideaRes.idea;
        setIdea(loadedIdea);
        setTask(taskRes.task);

        const params = taskRes.task?.params;
        if (params) {
          setPlatform(params.platform);
          if (!FIXED_TARGETS[params.platform]) setTargets(params.targets);
          setBackend(params.backend);
          setAuth(params.auth);
          setTheme(params.design.theme);
          setStyle(params.design.style);
          setGamification(params.design.gamification);
          setDensity(params.design.density);
          setReferences(params.design.references ?? "");
          setNotes(params.notes ?? "");
          setSelected(params.mvp_features.filter((f) => loadedIdea.core_features.includes(f)));
          setCustom(params.mvp_features.filter((f) => !loadedIdea.core_features.includes(f)));
        } else {
          // Önerilen aralığın üst sınırına kadar fikrin ilk özellikleri seçili gelir.
          setSelected(loadedIdea.core_features.slice(0, SUGGESTED_MAX));
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
  }, [id]);

  const fixedTargets = FIXED_TARGETS[platform];
  const effectiveTargets = fixedTargets ?? targets;

  function toggleTarget(target: TaskTarget, checked: boolean) {
    setTargets((prev) =>
      checked ? CROSS_PLATFORM_TARGETS.filter((t) => t === target || prev.includes(t)) : prev.filter((t) => t !== target),
    );
  }

  const features = [...selected, ...custom];
  const featureCount = features.length;

  function toggleFeature(feature: string, checked: boolean) {
    setSelected((prev) =>
      checked ? (idea?.core_features ?? []).filter((f) => f === feature || prev.includes(f)) : prev.filter((f) => f !== feature),
    );
  }

  function addCustom() {
    const value = customDraft.trim();
    if (!value || features.includes(value) || featureCount >= MAX_FEATURES) return;
    setCustom((prev) => [...prev, value]);
    setCustomDraft("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || featureCount === 0 || effectiveTargets.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createTask(id, {
        platform,
        targets: effectiveTargets,
        backend,
        auth,
        mvp_features: features,
        design: { theme, style, gamification, density, references: references.trim() || undefined },
        notes: notes.trim() || undefined,
      });
      navigate(`/ideas/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(
        message.includes("HTTP 409")
          ? "Bu fikrin görevi şu an değiştirilemiyor (belgeler hazırlanıyor ya da iskelet aşamasına geçilmiş)."
          : message.includes("HTTP 500")
            ? `Gönderilemedi: ${message}. GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı eklenmemiş olabilir.`
            : `Gönderilemedi: ${message}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const backLink = (
    <Link
      to={id ? `/ideas/${id}` : "/ideas"}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Fikre dön
    </Link>
  );

  if (!loaded) return <PageMessage>Yükleniyor…</PageMessage>;
  if (loadError || !idea) return <PageMessage tone="error">Fikir yüklenemedi: {loadError}</PageMessage>;

  const isReplan = task != null;
  const locked = task != null && !REPLANNABLE_STATUSES.includes(task.status);
  const notAllowed = task == null && idea.status !== "new" && idea.status !== "on_hold";

  if (locked || notAllowed) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <PageHeader title={`Geliştir — ${idea.name}`} />
        <PageMessage>
          {locked && task
            ? `Bu fikrin görevi şu an düzenlenemiyor (${TASK_STATUS_LABELS[task.status]}).`
            : "Bu fikir için geliştirme başlatılamaz."}
        </PageMessage>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {backLink}
      <PageHeader
        title={`Geliştir — ${idea.name}`}
        description={
          isReplan
            ? "Parametreleri düzenleyip gönderirsen Claude planlama belgelerini baştan yazar; mevcut belgeler (düzenlemelerin dahil) değiştirilir."
            : "Seçimlerine göre Claude dört planlama belgesi yazar (ürün, ekranlar, teknik plan, yol haritası). Belgeleri inceleyip onaylamadan iskelet kurulmaz."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Teknik tercihler</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <LabeledSelect label="Platform" value={platform} onChange={setPlatform} options={PLATFORM_LABELS} />
          <LabeledSelect label="Backend" value={backend} onChange={setBackend} options={BACKEND_LABELS} />
          <LabeledSelect label="Kimlik doğrulama" value={auth} onChange={setAuth} options={AUTH_LABELS} />
          <div className="flex flex-col gap-2 sm:col-span-3">
            <Label>Hedef cihazlar</Label>
            {fixedTargets ? (
              <p className="text-sm text-muted-foreground">
                Yalnızca {fixedTargets.map((t) => TARGET_LABELS[t]).join(", ")} — platform seçimi hedefi belirliyor.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4">
                  {CROSS_PLATFORM_TARGETS.map((target) => (
                    <div key={target} className="flex items-center gap-2">
                      <Checkbox
                        id={`target-${target}`}
                        checked={targets.includes(target)}
                        onCheckedChange={(v) => toggleTarget(target, v === true)}
                      />
                      <Label htmlFor={`target-${target}`} className="font-normal">
                        {TARGET_LABELS[target]}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className={targets.length === 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {targets.length === 0
                    ? "En az bir hedef seç."
                    : "Çapraz platform araçla yalnızca seçtiğin hedef(ler) için plan ve iskelet hazırlanır. Web işaretlenirse aynı kod tarayıcıda da çalışır."}
                </p>
              </>
            )}
          </div>
          {backend === "none" && auth !== "none" && (
            <p className="text-xs text-amber-700 sm:col-span-3 dark:text-amber-300">
              Backend olmadan giriş özelliği genelde anlamsızdır — Claude bunu belgelerde açık soru olarak işaretler.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">MVP özellikleri</CardTitle>
          <p
            className={
              featureCount < SUGGESTED_MIN || featureCount > SUGGESTED_MAX
                ? "text-xs text-amber-700 dark:text-amber-300"
                : "text-xs text-muted-foreground"
            }
          >
            {featureCount} seçili — {SUGGESTED_MIN}-{SUGGESTED_MAX} önerilir (en fazla {MAX_FEATURES}).
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {idea.core_features.map((feature, index) => {
            const checkboxId = `feature-${index}`;
            const checked = selected.includes(feature);
            return (
              <div key={feature} className="flex items-start gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={!checked && featureCount >= MAX_FEATURES}
                  onCheckedChange={(value) => toggleFeature(feature, value === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={checkboxId} className="leading-snug font-normal">
                  {feature}
                </Label>
              </div>
            );
          })}

          {custom.map((feature) => (
            <div key={feature} className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1 break-words">
                <span className="mr-1.5 text-xs text-muted-foreground">Ek:</span>
                {feature}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Kaldır"
                onClick={() => setCustom((prev) => prev.filter((f) => f !== feature))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Kendi özelliğini ekle…"
              maxLength={300}
              disabled={featureCount >= MAX_FEATURES}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustom}
              disabled={!customDraft.trim() || featureCount >= MAX_FEATURES}
            >
              <Plus className="size-4" />
              Ekle
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Tasarım</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <LabeledSelect label="Tema" value={theme} onChange={setTheme} options={THEME_LABELS} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <LabeledSelect label="Görsel dil" value={style} onChange={setStyle} options={STYLE_LABELS} />
            <p className="text-xs text-muted-foreground">{STYLE_DESCRIPTIONS[style]}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <LabeledSelect
              label="Oyunlaştırma"
              value={gamification}
              onChange={setGamification}
              options={GAMIFICATION_LABELS}
            />
            <p className="text-xs text-muted-foreground">
              Bağlayıcıdır: "Yok" seçilirse fikirde seri/rozet/puan olsa bile MVP'ye girmez.
            </p>
          </div>
          <LabeledSelect label="Bilgi yoğunluğu" value={density} onChange={setDensity} options={DENSITY_LABELS} />
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="task-references">Referans uygulamalar (isteğe bağlı)</Label>
            <Input
              id="task-references"
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              maxLength={300}
              placeholder="Örn. Things 3'ün sadeliği, Linear'ın yoğunluğu"
            />
          </div>
          {style === "playful" && gamification === "none" && (
            <p className="text-xs text-amber-700 sm:col-span-2 dark:text-amber-300">
              Oyunsu görsel dil yalnızca görünümü etkiler; oyunlaştırma "Yok" kaldıkça seri, rozet veya puan eklenmez.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Ek notlar</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="task-notes" className="sr-only">
            Ek notlar
          </Label>
          <Textarea
            id="task-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Örn. hedef pazar, örnek aldığın uygulamalar, kaçınılacak şeyler…"
          />
        </CardContent>
      </Card>

      {submitError && <PageMessage tone="error">{submitError}</PageMessage>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submitting || featureCount === 0 || effectiveTargets.length === 0}>
          {submitting ? "Gönderiliyor…" : isReplan ? "Belgeleri yeniden üret" : "Belgeleri hazırla"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate(`/ideas/${id}`)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function LabeledSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Record<T, string>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(options) as [T, string][]).map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
