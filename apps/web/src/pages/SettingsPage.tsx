import { useEffect, useState } from "react";
import { fetchSettings, patchSettings, type SourceSettingKey } from "@/lib/api";
import { WorkflowTriggerButton } from "@/components/WorkflowTriggerButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const SOURCE_LABELS: Record<SourceSettingKey, string> = {
  source_reddit_enabled: "Reddit",
  source_appstore_enabled: "App Store",
  source_producthunt_enabled: "Product Hunt",
  source_hackernews_enabled: "Hacker News",
};

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<SourceSettingKey, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((res) => setSettings(res.settings))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function handleToggle(key: SourceSettingKey, checked: boolean) {
    if (!settings) return;
    setSettings({ ...settings, [key]: checked });
    try {
      await patchSettings(key, checked);
    } catch (err) {
      // başarısızsa eski değere geri dön
      setSettings((prev) => (prev ? { ...prev, [key]: !checked } : prev));
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">Ayarlar yüklenemedi: {error}</p>;
  if (!settings) return <p className="py-10 text-center text-muted-foreground">Yükleniyor…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Trend kaynakları</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Kapatılan bir kaynak, bir sonraki günlük fikir üretiminde atlanır.
          </p>
          {(Object.keys(SOURCE_LABELS) as SourceSettingKey[]).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={key}
                checked={settings[key]}
                onCheckedChange={(checked) => handleToggle(key, checked === true)}
              />
              <Label htmlFor={key} className="font-normal">
                {SOURCE_LABELS[key]}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Manuel tetikleme</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Günlük cron'u zamanlanmış saati beklemeden şimdi çalıştırır (aktif kaynak ayarlarıyla).
          </p>
          <WorkflowTriggerButton
            label="Cron'u şimdi tetikle"
            loadingLabel="Tetikleniyor…"
            successMessage="Tetiklendi — birkaç dakika içinde Cron Geçmişi'nde görünecek."
            workflow="daily-ideas.yml"
            variant="default"
          />
        </CardContent>
      </Card>
    </div>
  );
}
