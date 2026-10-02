import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchIdeas, type Idea, type IdeaStatus } from "@/lib/api";
import { DEVELOPMENT_STATUSES, READY_STATUSES, STATUS_LABELS, TEST_STATUSES } from "@/lib/idea-colors";
import { IdeaTable } from "@/components/IdeaTable";
import { ListPageLayout, PageHeader, PageMessage } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Belirli durumlardaki fikirleri gösteren liste ekranı (Geliştirilenler,
// Test, Dağıtıma hazır). Bu listeler doğası gereği küçük — tam filtre çubuğu
// yerine yalnızca durum seçici (birden fazla durum varsa).
function StatusListPage({
  title,
  description,
  statuses,
  emptyMessage,
}: {
  title: string;
  description: ReactNode;
  statuses: IdeaStatus[];
  emptyMessage: string;
}) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<IdeaStatus | "all">("all");

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const pool = useMemo(() => (ideas ?? []).filter((idea) => statuses.includes(idea.status)), [ideas, statuses]);

  const filtered = useMemo(
    () => (status === "all" ? pool : pool.filter((idea) => idea.status === status)),
    [pool, status],
  );

  const header = <PageHeader title={title} description={description} />;

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

      {statuses.length > 1 && (
        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label>Durum</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as IdeaStatus | "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hepsi</SelectItem>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <IdeaTable
        ideas={filtered}
        totalCount={pool.length}
        emptyMessage={pool.length === 0 ? emptyMessage : "Bu duruma uyan fikir yok."}
      />
    </ListPageLayout>
  );
}

export function DevelopedPage() {
  return (
    <StatusListPage
      title="Geliştirilenler"
      description={
        <>
          "Geliştir" denen fikirler: belgeleri onay bekleyenler, geliştirilenler ve testten
          revizyona dönenler. "Geliştirildi" denenler <span className="font-medium">Test</span> ekranına geçer.
        </>
      }
      statuses={DEVELOPMENT_STATUSES}
      emptyMessage="Henüz geliştirilmeye başlanan bir fikir yok."
    />
  );
}

export function TestingPage() {
  return (
    <StatusListPage
      title="Test"
      description="Geliştirilmiş, test bekleyen ya da testi süren fikirler. Onaylananlar Dağıtıma hazır ekranına geçer."
      statuses={TEST_STATUSES}
      emptyMessage="Test bekleyen ya da test edilen bir fikir yok."
    />
  );
}

export function ReadyPage() {
  return (
    <StatusListPage
      title="Dağıtıma hazır"
      description="Testi onaylanmış fikirler."
      statuses={READY_STATUSES}
      emptyMessage="Henüz testi onaylanmış bir fikir yok."
    />
  );
}
