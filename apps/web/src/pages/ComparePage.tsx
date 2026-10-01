import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { fetchIdea, patchIdea, type Idea } from "@/lib/api";
import { ScoreSlider } from "@/components/ScoreSlider";
import { SourceIcon } from "@/components/SourceIcon";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { categoryColorClasses, statusColorClasses, STATUS_LABELS } from "@/lib/idea-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const ids = useMemo(() => [...new Set(idsParam.split(",").filter(Boolean))].slice(0, 4), [idsParam]);
  const [ideas, setIdeas] = useState<Record<string, Idea>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(ids.map((id) => fetchIdea(id).then((res) => res.idea)))
      .then((results) => {
        if (cancelled) return;
        setIdeas(Object.fromEntries(results.map((idea) => [idea.id, idea])));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  function removeIdea(id: string) {
    const next = ids.filter((i) => i !== id);
    setSearchParams(next.length > 0 ? { ids: next.join(",") } : {});
  }

  async function handleRate(id: string, value: number) {
    const res = await patchIdea(id, { user_rating: value });
    setIdeas((prev) => ({ ...prev, [id]: res.idea }));
  }

  if (ids.length === 0) {
    return <PageMessage>Karşılaştırmak için fikirler listesinden seç.</PageMessage>;
  }

  // Tek fikir kaldıysa artık normal detay/düzenleme görünümüne dön.
  if (ids.length === 1) {
    return <Navigate to={`/ideas/${ids[0]}`} replace />;
  }

  if (error) return <PageMessage tone="error">Fikirler yüklenemedi: {error}</PageMessage>;

  const loadedIdeas = ids.map((id) => ideas[id]).filter((idea): idea is Idea => idea != null);
  if (loadedIdeas.length < ids.length) {
    return <PageMessage>Yükleniyor…</PageMessage>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/ideas" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Fikirler
      </Link>

      <PageHeader title="Karşılaştırma" description={`${loadedIdeas.length} fikir yan yana. Buradan puan da verebilirsin.`} />

      <div className="grid gap-4 sm:grid-cols-2">
        {loadedIdeas.map((idea) => (
          <Card key={idea.id} className="min-w-0">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg">{idea.name}</CardTitle>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>
                    <Badge className={statusColorClasses(idea.status)}>{STATUS_LABELS[idea.status]}</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => removeIdea(idea.id)} aria-label="Karşılaştırmadan kaldır">
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-3 break-words">
              <p className="text-sm text-muted-foreground">{idea.one_liner}</p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <CompareStat label="Claude puanı" value={`${idea.scores.overall.toFixed(2)}/10`} />
                <CompareStat
                  label="Pazar / Uygulanabilirlik / Özgünlük"
                  value={`${idea.scores.market.toFixed(2)} / ${idea.scores.feasibility_solo_dev.toFixed(2)} / ${idea.scores.originality.toFixed(2)}`}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Senin puanın</div>
                <ScoreSlider value={idea.user_rating} onChange={(v) => handleRate(idea.id, v)} />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Gelir modeli</div>
                <p className="text-sm">{idea.monetization}</p>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Temel özellikler</div>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {idea.core_features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>

              {idea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {idea.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {idea.inspiration_sources.map((source) => (
                  <SourceIcon key={source} url={source} />
                ))}
              </div>

              <Link to={`/ideas/${idea.id}`} className="text-sm text-primary underline underline-offset-4">
                Tam detaya git
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CompareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium tabular-nums">{value}</div>
    </div>
  );
}
