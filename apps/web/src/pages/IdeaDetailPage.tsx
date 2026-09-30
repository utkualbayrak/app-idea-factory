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
    <div className="flex flex-col gap-5">
      <Link to="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Fikirler
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{idea.name}</h1>
          <Badge variant="secondary">{idea.category}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{idea.one_liner}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Claude puan dökümü</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScoreBar label="Pazar" value={idea.scores.market} />
          <ScoreBar label="Uygulanabilirlik (solo)" value={idea.scores.feasibility_solo_dev} />
          <ScoreBar label="Özgünlük" value={idea.scores.originality} />
          <ScoreBar label="Genel" value={idea.scores.overall} highlight />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard title="Problem">{idea.problem}</InfoCard>
        <InfoCard title="Hedef kitle">{idea.target_audience}</InfoCard>
      </div>

      <InfoCard title="Temel özellikler">
        <ul className="list-disc space-y-1 pl-5">
          {idea.core_features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </InfoCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard title="Gelir modeli">{idea.monetization}</InfoCard>
        <InfoCard title="İlham kaynağı">
          <a
            href={idea.inspiration_source}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-primary underline underline-offset-4"
            title={idea.inspiration_source}
          >
            {idea.inspiration_source}
          </a>
        </InfoCard>
      </div>

      <InfoCard title="Senin puanın">
        <StarRating value={idea.user_rating} onChange={handleRate} size="lg" />
      </InfoCard>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Not</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="note" className="sr-only">
            Not
          </Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Kısa bir not ekle…" />
          <Button onClick={handleSaveNote} disabled={saving} className="w-fit">
            {saving ? "Kaydediliyor…" : "Notu kaydet"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
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

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ScoreBar({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(100px,140px)_1fr_40px] items-center gap-3 text-sm">
      <span className={highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-right text-muted-foreground">{value}/10</span>
    </div>
  );
}
