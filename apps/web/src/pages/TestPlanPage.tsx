import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  fetchDevReports,
  fetchIdea,
  fetchIdeaTask,
  startTestRound,
  type Idea,
  type TestChannel,
  type TestPlatform,
} from "@/lib/api";
import {
  defaultTestChannel,
  defaultTestPlatforms,
  SUCCESS_CRITERIA_SUGGESTIONS,
  TEST_CHANNEL_LABELS,
  TEST_PLATFORM_LABELS,
  TEST_PLATFORMS,
} from "@/lib/test-labels";
import { addDaysIso, formatBatchDate, todayIso } from "@/lib/format-date";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { RowListInput } from "@/components/RowListInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// "Testi başlat" formu: kaç kişi, kaç gün, ne zaman, hangi platform ve
// kanaldan, neyin deneneceği (senaryolar) ve başarı kriterleri. Gönderilince
// fikir "Test ediliyor"a geçer.
export interface TestPlanFormProps {
  ideaId: string;
  /** Gönderim başarılı olunca. */
  onDone: () => void;
  onCancel: () => void;
  /** Kanban penceresinde: geri linki gösterilmez. */
  inDialog?: boolean;
}

export function TestPlanForm({ ideaId, onDone, onCancel, inDialog = false }: TestPlanFormProps) {
  const id = ideaId;
  const [idea, setIdea] = useState<Idea | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scenarioSuggestions, setScenarioSuggestions] = useState<string[]>([]);

  const [testerCount, setTesterCount] = useState("5");
  const [durationDays, setDurationDays] = useState("7");
  const [startDate, setStartDate] = useState(todayIso());
  const [platforms, setPlatforms] = useState<TestPlatform[]>(["ios", "android"]);
  const [channel, setChannel] = useState<TestChannel>("expo_go");
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchIdea(id), fetchIdeaTask(id), fetchDevReports(id)])
      .then(([ideaRes, taskRes, reportsRes]) => {
        setIdea(ideaRes.idea);
        const params = taskRes.task?.params;
        setPlatforms(defaultTestPlatforms(params));
        setChannel(defaultTestChannel(params));
        // Senaryo önerileri: MVP özellikleri + son turda fazladan eklenenler.
        const extras = reportsRes.reports[0]?.extra_features ?? [];
        setScenarioSuggestions([...(taskRes.task?.params.mvp_features ?? []), ...extras]);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoaded(true));
  }, [id]);

  const testers = Number(testerCount);
  const days = Number(durationDays);
  const validNumbers = Number.isInteger(testers) && testers >= 1 && Number.isInteger(days) && days >= 1;
  const valid = validNumbers && platforms.length > 0 && scenarios.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startDate);

  function togglePlatform(platform: TestPlatform, checked: boolean) {
    setPlatforms((prev) =>
      checked ? TEST_PLATFORMS.filter((p) => p === platform || prev.includes(p)) : prev.filter((p) => p !== platform),
    );
  }

  async function handleSubmit() {
    if (!id || !valid) return;
    setSubmitError(null);
    try {
      await startTestRound(id, {
        tester_count: testers,
        duration_days: days,
        start_date: startDate,
        platforms,
        channel,
        scenarios: scenarios.map((s) => s.trim()).filter(Boolean),
        success_criteria: criteria.map((s) => s.trim()).filter(Boolean),
      });
      onDone();
    } catch (err) {
      setSubmitError(`Başlatılamadı: ${err instanceof Error ? err.message : String(err)}`);
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

  if (idea.status !== "awaiting_test") {
    return (
      <div className="flex flex-col gap-4">
        {!inDialog && backLink}
        <PageHeader title={`Testi başlat — ${idea.name}`} />
        <PageMessage>Test yalnızca "Test bekliyor" durumundaki bir fikir için başlatılabilir.</PageMessage>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!inDialog && backLink}
      <PageHeader
        title={`Testi başlat — ${idea.name}`}
        description={
          <>
            Test planını kaydet; fikir <span className="font-medium">Test ediliyor</span> durumuna geçer. Test bitince
            sonuçları ve bulguları ayrı bir formla girersin.
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Kapsam</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tester-count">Test eden kişi sayısı</Label>
            <Input
              id="tester-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={testerCount}
              onChange={(e) => setTesterCount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duration-days">Süre (gün)</Label>
            <Input
              id="duration-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-date">Başlangıç</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {validNumbers && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && (
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Planlanan bitiş: {formatBatchDate(addDaysIso(startDate, days - 1))} · {testers} kişi × {days} gün
            </p>
          )}
          {!validNumbers && (
            <p className="text-xs text-destructive sm:col-span-3">Kişi ve gün sayısı en az 1 olan tam sayılar olmalı.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Platform ve dağıtım</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Platformlar</Label>
            <div className="flex flex-wrap gap-4">
              {TEST_PLATFORMS.map((platform) => (
                <div key={platform} className="flex items-center gap-2">
                  <Checkbox
                    id={`platform-${platform}`}
                    checked={platforms.includes(platform)}
                    onCheckedChange={(v) => togglePlatform(platform, v === true)}
                  />
                  <Label htmlFor={`platform-${platform}`} className="font-normal">
                    {TEST_PLATFORM_LABELS[platform]}
                  </Label>
                </div>
              ))}
            </div>
            {platforms.length === 0 && <p className="text-xs text-destructive">En az bir platform seç.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Dağıtım kanalı</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as TestChannel)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TEST_CHANNEL_LABELS) as TestChannel[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {TEST_CHANNEL_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Senaryolar</CardTitle>
          <p className="text-xs text-muted-foreground">
            Test edenlerin deneyeceği akışlar. Sonuç formunda her biri için geçti/kaldı işaretlenir. En az bir tane.
          </p>
        </CardHeader>
        <CardContent>
          <RowListInput
            values={scenarios}
            onChange={setScenarios}
            placeholder="Örn. İlk açılışta hesap oluşturup bir seans başlat…"
            suggestions={scenarioSuggestions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Başarı kriterleri</CardTitle>
          <p className="text-xs text-muted-foreground">Testin "geçti" sayılması için ne olmalı (isteğe bağlı).</p>
        </CardHeader>
        <CardContent>
          <RowListInput
            values={criteria}
            onChange={setCriteria}
            placeholder="Bir kriter…"
            max={20}
            suggestions={SUCCESS_CRITERIA_SUGGESTIONS}
          />
        </CardContent>
      </Card>

      {submitError && <PageMessage tone="error">{submitError}</PageMessage>}

      <div className="flex flex-wrap gap-3">
        <ConfirmButton
          label="Testi başlat"
          title="Testi başlat?"
          description='Fikir "Test ediliyor" durumuna geçer. Test bitince sonuçları gir ya da gerekirse iptal et.'
          confirmLabel="Başlat"
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

export function TestPlanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return null;
  const back = () => navigate(`/ideas/${id}`);
  return <TestPlanForm ideaId={id} onDone={back} onCancel={back} />;
}
