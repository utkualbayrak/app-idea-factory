import { useEffect, useMemo, useState } from "react";
import { fetchIdeas, type Idea } from "@/lib/api";
import { IdeaTable } from "@/components/IdeaTable";
import { ListPageLayout, PageHeader, PageMessage } from "@/components/PageHeader";
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

  const developing = useMemo(
    () => (ideas ?? []).filter((idea) => idea.status === "in_development" || idea.status === "developed"),
    [ideas],
  );

  const filtered = useMemo(
    () => (status === "all" ? developing : developing.filter((idea) => idea.status === status)),
    [developing, status],
  );


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
    <ListPageLayout>
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

      <IdeaTable
        ideas={filtered}
        totalCount={developing.length}
        emptyMessage={
          developing.length === 0 ? "Henüz geliştirilmeye başlanan bir fikir yok." : "Bu duruma uyan fikir yok."
        }
      />
    </ListPageLayout>
  );
}
