import { useEffect, useMemo, useState } from "react";
import { fetchIdeas, type Idea, type IdeaStatus } from "@/lib/api";
import { DEVELOPMENT_STATUSES, isInDevelopmentFlow, STATUS_LABELS } from "@/lib/idea-colors";
import { IdeaTable } from "@/components/IdeaTable";
import { ListPageLayout, PageHeader, PageMessage } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export function DevelopedPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<IdeaStatus | "all">("all");

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const developing = useMemo(
    () => (ideas ?? []).filter((idea) => isInDevelopmentFlow(idea.status)),
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
          "Geliştir" denen fikirler burada: belgeleri onay bekleyenler, iskeleti kurulanlar ve
          tamamlananlar. Geri kalanı{" "}
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
        <Select value={status} onValueChange={(v) => setStatus(v as IdeaStatus | "all")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Hepsi</SelectItem>
            {DEVELOPMENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
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
