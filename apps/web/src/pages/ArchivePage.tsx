import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchArchivedIdeas, fetchSettings, restoreIdea, type Idea } from "@/lib/api";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { categoryColorClasses } from "@/lib/idea-colors";
import { formatDate, formatPurgeDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Havuz bakımının arşivlediği fikirler: yalnızca özetleri kaldı. "Geri getir"
// fikri Fikirler listesine döndürür ve Claude boşalan alanları yeniden doldurur.
export function ArchivePage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [purgeDays, setPurgeDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    fetchArchivedIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    load();
    fetchSettings()
      .then((res) => setPurgeDays(res.maintenance.purge_after_days))
      .catch(() => {});
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!ideas || !query) return ideas ?? [];
    return ideas.filter((idea) =>
      [idea.name, idea.one_liner, idea.category, ...idea.tags].some((v) => v.toLowerCase().includes(query)),
    );
  }, [ideas, search]);

  const header = (
    <PageHeader
      title="Arşiv"
      description={`Bakım puanı art arda 3 havuz bakımında 7.00'ın altında kalan fikirler. Yalnızca özetleri tutulur${
        purgeDays != null ? `, ${purgeDays} gün sonra kalıcı silinir (adları tekrar kullanılmaz)` : ""
      }.`}
      actions={
        <Link to="/ideas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Fikirler
        </Link>
      }
    />
  );

  if (error)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PageMessage tone="error">Arşiv yüklenemedi: {error}</PageMessage>
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
      {ideas.length > 0 && (
        <Input
          placeholder="Ad, özet, kategori ya da etikete göre ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      )}
      {ideas.length === 0 && <PageMessage>Arşivde fikir yok.</PageMessage>}
      {ideas.length > 0 && filtered.length === 0 && <PageMessage>Aramaya uyan fikir yok.</PageMessage>}
      <div className="flex flex-col gap-3">
        {filtered.map((idea) => (
          <ArchivedIdeaCard key={idea.id} idea={idea} purgeDays={purgeDays} onRestored={load} />
        ))}
      </div>
    </div>
  );
}

function ArchivedIdeaCard({
  idea,
  purgeDays,
  onRestored,
}: {
  idea: Idea;
  purgeDays: number | null;
  onRestored: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);

  async function handleRestore() {
    setMessage(null);
    try {
      const res = await restoreIdea(idea.id);
      if (res.dispatch_error) setMessage(res.dispatch_error);
      onRestored();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link to={`/ideas/${idea.id}`} className="truncate font-medium text-primary underline underline-offset-4">
              {idea.name}
            </Link>
            {idea.category && <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>}
          </div>
          <p className="text-sm break-words text-muted-foreground">{idea.one_liner}</p>
          <p className="text-xs text-muted-foreground">
            Claude: <span className="tabular-nums text-foreground">{idea.scores?.overall.toFixed(2) ?? "—"}</span>
            {" · "}Senin puanın:{" "}
            <span className="tabular-nums text-foreground">{idea.user_rating?.toFixed(2) ?? "—"}</span>
            {idea.archived_at && ` · arşivlendi ${formatDate(idea.archived_at)}`}
            {idea.archived_at && purgeDays != null && ` · kalıcı silinme ${formatPurgeDate(idea.archived_at, purgeDays)}`}
          </p>
          {message && <p className="text-sm text-destructive">{message}</p>}
        </div>
        <ConfirmButton
          label="Geri getir"
          title={`"${idea.name}" geri getirilsin mi?`}
          description="Fikir Fikirler listesine döner. Arşivde yalnızca özeti kaldığı için Claude problem, hedef kitle, özellikler ve gelir modelini özetten yeniden yazar ve puanlar; bu birkaç dakika sürer."
          confirmLabel="Geri getir"
          className="w-fit shrink-0"
          onConfirm={handleRestore}
        />
      </CardContent>
    </Card>
  );
}
