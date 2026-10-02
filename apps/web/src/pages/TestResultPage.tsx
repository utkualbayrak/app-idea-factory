import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  fetchIdea,
  fetchTestRounds,
  submitTestResult,
  type Idea,
  type ScenarioResult,
  type TestFinding,
  type TestRound,
} from "@/lib/api";
import {
  FINDING_KIND_LABELS,
  SCENARIO_RESULT_LABELS,
  SCENARIO_RESULT_STYLES,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  TEST_CHANNEL_LABELS,
} from "@/lib/test-labels";
import { daysBetweenIso, formatBatchDate, todayIso } from "@/lib/format-date";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FindingsInput } from "@/components/FindingsInput";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { ScoreSlider } from "@/components/ScoreSlider";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SCENARIO_OPTIONS = (Object.keys(SCENARIO_RESULT_LABELS) as ScenarioResult[]).map((value) => ({
  value,
  label: SCENARIO_RESULT_LABELS[value],
  activeClassName: `${SCENARIO_RESULT_STYLES[value]} shadow-sm hover:opacity-90`,
}));

// Test sonuç formu: kaç kişiyle kaç gün denendi, senaryolar, bulgular,
// memnuniyet ve karar (onay → Dağıtıma hazır, geri gönder → Revizyonda).
export interface TestResultFormProps {
  ideaId: string;
  /** Gönderim başarılı olunca. */
  onDone: () => void;
  onCancel: () => void;
  /** Kanban penceresinde: geri linki gösterilmez. */
  inDialog?: boolean;
  /** Kanban'dan sürüklenince seçili gelen karar. */
  initialDecision?: "approved" | "rework";
}

export function TestResultForm({ ideaId, onDone, onCancel, inDialog = false, initialDecision }: TestResultFormProps) {
  const id = ideaId;
  const [idea, setIdea] = useState<Idea | null>(null);
  const [round, setRound] = useState<TestRound | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [testerCount, setTesterCount] = useState("");
  const [days, setDays] = useState("");
  const [scenarioResults, setScenarioResults] = useState<(ScenarioResult | null)[]>([]);
  const [findings, setFindings] = useState<TestFinding[]>([]);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approved" | "rework" | null>(initialDecision ?? null);
  const [reworkSummary, setReworkSummary] = useState("");
  const [reworkFindings, setReworkFindings] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchIdea(id), fetchTestRounds(id)])
      .then(([ideaRes, roundsRes]) => {
        setIdea(ideaRes.idea);
        const running = roundsRes.rounds.find((r) => r.status === "running") ?? null;
        setRound(running);
        if (running) {
          setTesterCount(String(running.plan.tester_count));
          // Varsayılan: başlangıçtan bugüne geçen gün, plan süresini aşmadan.
          const elapsed = daysBetweenIso(running.plan.start_date, todayIso()) + 1;
          setDays(String(Math.max(1, Math.min(running.plan.duration_days, elapsed))));
          setScenarioResults(running.plan.scenarios.map(() => null));
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
  }, [id]);

  const cleanFindings = useMemo(
    () => findings.map((f) => ({ ...f, text: f.text.trim() })).filter((f) => f.text),
    [findings],
  );

  // Geri göndermede kritik/orta bulgular önceden seçili gelir.
  function chooseDecision(value: "approved" | "rework") {
    setDecision(value);
    if (value === "rework" && reworkFindings.size === 0) {
      setReworkFindings(
        new Set(cleanFindings.flatMap((f, i) => (f.severity === "critical" || f.severity === "major" ? [i] : []))),
      );
    }
  }

  const testers = Number(testerCount);
  const actualDays = Number(days);
  const numbersValid = Number.isInteger(testers) && testers >= 0 && Number.isInteger(actualDays) && actualDays >= 0;
  const scenariosDone = scenarioResults.every((r) => r != null);
  const reworkValid = decision !== "rework" || reworkSummary.trim().length > 0;
  const valid = numbersValid && scenariosDone && decision != null && reworkValid;

  async function handleSubmit() {
    if (!round || !valid || !decision) return;
    setSubmitError(null);
    // Boş satırlar atıldığı için seçili bulgu indeksleri temiz listeye göre.
    const indexes = [...reworkFindings].filter((i) => i < cleanFindings.length).sort((a, b) => a - b);
    try {
      await submitTestResult(round.id, {
        result: {
          actual_tester_count: testers,
          actual_days: actualDays,
          scenario_results: round.plan.scenarios.map((scenario, i) => ({
            scenario,
            result: scenarioResults[i] ?? "skipped",
          })),
          findings: cleanFindings,
          satisfaction,
        },
        decision,
        rework_reason: decision === "rework" ? { summary: reworkSummary.trim(), finding_indexes: indexes } : undefined,
      });
      onDone();
    } catch (err) {
      setSubmitError(`Gönderilemedi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const backLink = (
    <Link
      to={id ? `/ideas/${id}` : "/testing"}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Fikre dön
    </Link>
  );

  if (!loaded) return <PageMessage>Yükleniyor…</PageMessage>;
  if (loadError || !idea) return <PageMessage tone="error">Fikir yüklenemedi: {loadError}</PageMessage>;
  if (!round) {
    return (
      <div className="flex flex-col gap-4">
        {!inDialog && backLink}
        <PageHeader title={`Test sonuçları — ${idea.name}`} />
        <PageMessage>Bu fikrin açık bir test turu yok.</PageMessage>
      </div>
    );
  }

  const { plan } = round;
  const bothPlatforms = plan.platforms.length > 1;

  return (
    <div className="flex flex-col gap-5">
      {!inDialog && backLink}
      <PageHeader
        title={`Test sonuçları — ${idea.name}`}
        description={`${round.round}. tur · ${formatBatchDate(plan.start_date)} başladı · plan: ${plan.tester_count} kişi × ${plan.duration_days} gün · ${TEST_CHANNEL_LABELS[plan.channel]}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Gerçekleşen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="actual-testers">Kaç kişi test etti</Label>
            <Input
              id="actual-testers"
              type="number"
              inputMode="numeric"
              min={0}
              value={testerCount}
              onChange={(e) => setTesterCount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="actual-days">Kaç gün sürdü</Label>
            <Input
              id="actual-days"
              type="number"
              inputMode="numeric"
              min={0}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          {!numbersValid && <p className="text-xs text-destructive sm:col-span-2">Sayılar 0 ya da daha büyük tam sayı olmalı.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Senaryolar</CardTitle>
          {!scenariosDone && <p className="text-xs text-muted-foreground">Her senaryo için bir sonuç seç.</p>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {plan.scenarios.map((scenario, i) => (
            <div key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p className="min-w-0 text-sm break-words">{scenario}</p>
              <SegmentedControl
                value={scenarioResults[i]}
                options={SCENARIO_OPTIONS}
                onChange={(value) => setScenarioResults((prev) => prev.map((r, j) => (j === i ? value : r)))}
                ariaLabel={`Senaryo ${i + 1} sonucu`}
              />
            </div>
          ))}
          {plan.success_criteria.length > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Başarı kriterleri (planda)</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {plan.success_criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Bulgular</CardTitle>
          <p className="text-xs text-muted-foreground">Hatalar, takılınan yerler, gelen istekler. Boş bırakılabilir.</p>
        </CardHeader>
        <CardContent>
          <FindingsInput
            values={findings}
            onChange={setFindings}
            showPlatform={bothPlatforms}
            defaultPlatform={bothPlatforms ? "both" : plan.platforms[0]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Genel memnuniyet</CardTitle>
          <p className="text-xs text-muted-foreground">Test edenlerin ortalama memnuniyeti (isteğe bağlı).</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ScoreSlider value={satisfaction} onChange={setSatisfaction} />
          {satisfaction != null && (
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setSatisfaction(null)}>
              Temizle
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Karar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SegmentedControl
            value={decision}
            onChange={chooseDecision}
            ariaLabel="Karar"
            options={[
              {
                value: "approved",
                label: "Onayla (dağıtıma hazır)",
                activeClassName: "bg-emerald-100 text-emerald-800 shadow-sm hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200",
              },
              {
                value: "rework",
                label: "Geliştirmeye geri gönder",
                activeClassName: "bg-rose-100 text-rose-800 shadow-sm hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200",
              },
            ]}
          />

          {decision === "rework" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rework-summary">Neden geri gönderiliyor (kısa özet)</Label>
                <Input
                  id="rework-summary"
                  value={reworkSummary}
                  maxLength={300}
                  onChange={(e) => setReworkSummary(e.target.value)}
                  placeholder="Örn. Android'de bildirimler gelmiyor, seans ekranı karışık bulundu"
                />
                {!reworkSummary.trim() && <p className="text-xs text-destructive">Özet zorunlu.</p>}
              </div>
              {cleanFindings.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Geliştirmede ele alınacak bulgular</Label>
                  {cleanFindings.map((finding, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Checkbox
                        id={`rework-finding-${i}`}
                        checked={reworkFindings.has(i)}
                        onCheckedChange={(v) =>
                          setReworkFindings((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(i);
                            else next.delete(i);
                            return next;
                          })
                        }
                        className="mt-0.5"
                      />
                      <Label htmlFor={`rework-finding-${i}`} className="flex flex-wrap items-center gap-1.5 leading-snug font-normal">
                        <Badge className={SEVERITY_STYLES[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
                        <span className="text-xs text-muted-foreground">{FINDING_KIND_LABELS[finding.kind]}</span>
                        <span className="break-words">{finding.text}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {submitError && <PageMessage tone="error">{submitError}</PageMessage>}

      <div className="flex flex-wrap gap-3">
        <ConfirmButton
          label="Sonuçları kaydet"
          title={decision === "rework" ? "Geliştirmeye geri gönder?" : "Testi onayla?"}
          description={
            decision === "rework"
              ? 'Tur kapanır, fikir "Revizyonda" olarak Geliştirilenler ekranına döner; detayında geri gönderme sebebi görünür.'
              : 'Tur kapanır, fikir "Dağıtıma hazır" listesine geçer.'
          }
          confirmLabel="Kaydet"
          variant="default"
          disabled={!valid}
          onConfirm={handleSubmit}
        />
        <Button type="button" variant="outline" onClick={onCancel}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

export function TestResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return null;
  const back = () => navigate(`/ideas/${id}`);
  return <TestResultForm ideaId={id} onDone={back} onCancel={back} />;
}
