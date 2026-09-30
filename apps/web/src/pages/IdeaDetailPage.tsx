import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchIdea, patchIdea, type Idea } from "@/lib/api";
import { StarRating } from "@/components/StarRating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchIdea(id)
      .then((res) => {
        setIdea(res.idea);
        setNote(res.idea.user_note ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function handleRate(value: number) {
    if (!id) return;
    const res = await patchIdea(id, { user_rating: value });
    setIdea(res.idea);
  }

  async function handleSaveNote() {
    if (!id) return;
    setSaving(true);
    try {
      const res = await patchIdea(id, { user_note: note || null });
      setIdea(res.idea);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (!id || !idea) return;
    const nextStatus = idea.status === "archived" ? "new" : "archived";
    const res = await patchIdea(id, { status: nextStatus });
    setIdea(res.idea);
  }

  if (error) return <p className="py-10 text-center text-destructive">Fikir yüklenemedi: {error}</p>;
  if (!idea) return <p className="py-10 text-center text-muted-foreground">Yükleniyor…</p>;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Fikirler
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{idea.name}</h1>
          <Badge variant="secondary">{idea.category}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{idea.one_liner}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Claude puan dökümü</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScoreBar label="Pazar" value={idea.scores.market} />
          <ScoreBar label="Uygulanabilirlik (solo)" value={idea.scores.feasibility_solo_dev} />
          <ScoreBar label="Özgünlük" value={idea.scores.originality} />
          <ScoreBar label="Genel" value={idea.scores.overall} highlight />
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground uppercase tracking-wide">Problem</h2>
          <p>{idea.problem}</p>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground uppercase tracking-wide">Hedef kitle</h2>
          <p>{idea.target_audience}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Temel özellikler</h2>
        <ul className="list-disc space-y-1 pl-5">
          {idea.core_features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground uppercase tracking-wide">Gelir modeli</h2>
          <p>{idea.monetization}</p>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground uppercase tracking-wide">İlham kaynağı</h2>
          <a href={idea.inspiration_source} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
            {idea.inspiration_source}
          </a>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">Senin puanın</h2>
        <StarRating value={idea.user_rating} onChange={handleRate} size="lg" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note" className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Not
        </Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Kısa bir not ekle…" />
        <Button onClick={handleSaveNote} disabled={saving} className="w-fit">
          {saving ? "Kaydediliyor…" : "Notu kaydet"}
        </Button>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleToggleArchive}>
          {idea.status === "archived" ? "Arşivden çıkar" : "Arşivle"}
        </Button>
        <Button disabled title="Faz 3'te gelecek">
          Geliştir (yakında)
        </Button>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-sm">
      <span className={highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-right text-muted-foreground">{value}/10</span>
    </div>
  );
}
