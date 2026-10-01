import { useEffect, useMemo, useState } from "react";
import { fetchIdeas, type Idea } from "@/lib/api";
import { IdeaTable } from "@/components/IdeaTable";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { formatBatchDate } from "@/lib/format-date";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_LABELS: Record<"in_development" | "developed", string> = {
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

export function DevelopedPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"in_development" | "developed" | "all">("all");

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const filtered = useMemo(() => {
    const developing = (ideas ?? []).filter(
      (idea) => idea.status === "in_development" || idea.status === "developed",
    );
    return status === "all" ? developing : developing.filter((idea) => idea.status === status);
  }, [ideas, status]);

  const groups = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const idea of filtered) {
      const list = map.get(idea.batch_date) ?? [];
      list.push(idea);
      map.set(idea.batch_date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const header = (
    <PageHeader
      title="Geliştirilenler"
      description={
        <>
          "Geliştir" denip iskelet üretimi başlatılan fikirler burada — geri kalanı{" "}
          <span className="font-medium">Fikirler</span> listesinde.
        </>
      }
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

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="flex flex-col gap-1.5 sm:w-64">
        <Label>Durum</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as "in_development" | "developed" | "all")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Hepsi</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 && (
        <PageMessage>Henüz geliştirilmeye başlanan bir fikir yok.</PageMessage>
      )}

      {groups.map(([batchDate, batchIdeas]) => (
        <section key={batchDate} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{formatBatchDate(batchDate)}</h2>
          <IdeaTable ideas={batchIdeas} />
        </section>
      ))}
    </div>
  );
}
