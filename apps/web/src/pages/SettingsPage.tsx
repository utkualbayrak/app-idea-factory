import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSettings, patchSettings, type MaintenanceSettings, type SourceSettingKey } from "@/lib/api";
import { ManualJobsCard } from "@/components/ManualJobsCard";
import { UserNamesCard } from "@/components/UserNamesCard";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const INTERVAL_OPTIONS = [1, 2, 3, 5, 7, 14];
const PURGE_OPTIONS = [30, 60, 90, 180, 365];

const SOURCE_LABELS: Record<SourceSettingKey, string> = {
  source_reddit_enabled: "Reddit",
  source_appstore_enabled: "App Store",
  source_producthunt_enabled: "Product Hunt",
  source_hackernews_enabled: "Hacker News",
};

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<SourceSettingKey, boolean> | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((res) => {
        setSettings(res.settings);
        setMaintenance(res.maintenance);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function handleMaintenanceChange(key: keyof MaintenanceSettings, value: number) {
    if (!maintenance) return;
    const previous = maintenance[key];
    setMaintenance({ ...maintenance, [key]: value });
    try {
      await patchSettings(key, value);
    } catch (err) {
      setMaintenance((prev) => (prev ? { ...prev, [key]: previous } : prev));
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleToggle(key: SourceSettingKey, checked: boolean) {
    if (!settings || !maintenance) return;
    setSettings({ ...settings, [key]: checked });
    try {
      await patchSettings(key, checked);
    } catch (err) {
      // başarısızsa eski değere geri dön
      setSettings((prev) => (prev ? { ...prev, [key]: !checked } : prev));
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const header = <PageHeader title="Ayarlar" description="Trend kaynakları, havuz bakımı, işleri elle çalıştırma ve kullanıcılar." />;

  if (error)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage tone="error">Ayarlar yüklenemedi: {error}</PageMessage>
      </div>
    );
  if (!settings || !maintenance)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage>Yükleniyor…</PageMessage>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {header}

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
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Havuz bakımı</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Claude Fikirler listesindeki benzer fikirleri birleştirmeyi, geliştirmedeki fikirlere yakın olanları özellik
            önerisi yapmayı önerir. Hiç dokunmadığın fikirlerin birleştirmesi otomatik uygulanır (geri alınabilir); puan
            ya da not verdiğin veya askıya aldığın bir fikir varsa{" "}
            <Link to="/proposals" className="text-primary underline underline-offset-4">
              Öneriler
            </Link>
            'de onayını bekler.
          </p>
          <p className="text-sm text-muted-foreground">
            Bakım puanı (kendi puanın varsa %40 Claude + %60 senin puanın, yoksa Claude puanı) art arda 3 bakımda 7.00'ın
            altında kalan yeni fikirler{" "}
            <Link to="/ideas/archive" className="text-primary underline underline-offset-4">
              arşivlenir
            </Link>
            ; askıdakiler arşivlenmez. Arşivlenen ve sildiğin fikirler aşağıdaki süre sonunda kalıcı silinir, adları
            tekrar kullanılmaz.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="merge-interval" className="font-normal">
              Bakım aralığı
            </Label>
            <Select
              value={String(maintenance.merge_interval_days)}
              onValueChange={(v) => handleMaintenanceChange("merge_interval_days", Number(v))}
            >
              <SelectTrigger id="merge-interval" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...INTERVAL_OPTIONS, maintenance.merge_interval_days])]
                  .sort((a, b) => a - b)
                  .map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days === 1 ? "Her gün" : `${days} günde bir`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="purge-days" className="font-normal">
              Kalıcı silme
            </Label>
            <Select
              value={String(maintenance.purge_after_days)}
              onValueChange={(v) => handleMaintenanceChange("purge_after_days", Number(v))}
            >
              <SelectTrigger id="purge-days" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...PURGE_OPTIONS, maintenance.purge_after_days])]
                  .sort((a, b) => a - b)
                  .map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} gün sonra
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <ManualJobsCard />

      <UserNamesCard />
    </div>
  );
}
