import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GitCompare } from "lucide-react";
import { fetchIdea, fetchIdeas, patchIdea, type Idea } from "@/lib/api";
import { ScoreSlider } from "@/components/ScoreSlider";
import { ScoreReasonPopover } from "@/components/ScoreReasonPopover";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SourceIcon } from "@/components/SourceIcon";
import { SCORE_HELP } from "@/lib/score-help";
import { categoryColorClasses, statusColorClasses } from "@/lib/idea-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_LABELS: Record<Idea["status"], string> = {
  new: "Yeni",
  on_hold: "Askıda",
  deleted: "Silinmiş",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [otherIdeas, setOtherIdeas] = useState<Idea[] | null>(null);

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

  async function handleSetHold(nextStatus: "new" | "on_hold") {
    if (!id) return;
    const res = await patchIdea(id, { status: nextStatus });
    setIdea(res.idea);
  }

  async function handleDelete() {
    if (!id) return;
    const res = await patchIdea(id, { status: "deleted" });
    setIdea(res.idea);
  }

  function handleCompareMenuOpenChange(open: boolean) {
    if (open && !otherIdeas) {
      fetchIdeas().then((res) => setOtherIdeas(res.ideas.filter((i) => i.id !== id)));
    }
  }

  if (error) return <p className="py-10 text-center text-destructive">Fikir yüklenemedi: {error}</p>;
  if (!idea) return <p className="py-10 text-center text-muted-foreground">Yükleniyor…</p>;

  return (
    <div className="flex flex-col gap-5">
      {/* Geri butonu + fikir adı + kısa açıklama, üst header'ın (h-14)
          hemen altında sabit kalır — notlar/skor kartı vb. altında scroll'a
          devam eder ("scroll atildikca fikirler back butonu ve fikrin adi
          ile kisa aciklamasi sabit kalsin" isteği). */}
      <div className="sticky top-14 z-[5] -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Link to="/ideas" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Fikirler
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{idea.name}</h1>
          <Badge className={categoryColorClasses(idea.category)}>{idea.category}</Badge>
          <Badge className={statusColorClasses(idea.status)}>{STATUS_LABELS[idea.status]}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{idea.one_liner}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Claude puan dökümü</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScoreBar
            label="Pazar"
            help={SCORE_HELP.market}
            value={idea.scores.market}
            reason={idea.scores.market_reason}
          />
          <ScoreBar
            label="Uygulanabilirlik (solo)"
            help={SCORE_HELP.feasibility_solo_dev}
            value={idea.scores.feasibility_solo_dev}
            reason={idea.scores.feasibility_solo_dev_reason}
          />
          <ScoreBar
            label="Özgünlük"
            help={SCORE_HELP.originality}
            value={idea.scores.originality}
            reason={idea.scores.originality_reason}
          />
          <ScoreBar
            label="Genel"
            help={SCORE_HELP.overall}
            value={idea.scores.overall}
            reason={idea.scores.overall_reason}
            highlight
          />
        </CardContent>
      </Card>

      {(idea.status === "in_development" || idea.status === "developed") && (
        <InfoCard title="Geliştirme bilgileri">
          <p className="text-muted-foreground">
            Repo/issue linkleri henüz yok — görev formu ve iskelet üretimi Faz 3'te geliyor.
          </p>
        </InfoCard>
      )}

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
        <InfoCard title="İlham kaynakları">
          <div className="flex flex-wrap gap-2">
            {idea.inspiration_sources.map((source) => (
              <SourceIcon key={source} url={source} />
            ))}
          </div>
        </InfoCard>
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

      <InfoCard title="Senin puanın">
        <ScoreSlider value={idea.user_rating} onChange={handleRate} />
      </InfoCard>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Not</CardTitle>
          {idea.user_note_updated_at && (
            <p className="text-xs text-muted-foreground">
              Son güncelleme: {new Date(idea.user_note_updated_at).toLocaleString("tr-TR")}
            </p>
          )}
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
        <DropdownMenu onOpenChange={handleCompareMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <GitCompare className="size-4" />
              Karşılaştır
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {!otherIdeas ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Yükleniyor…</div>
            ) : otherIdeas.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Karşılaştırılacak başka fikir yok.</div>
            ) : (
              otherIdeas.map((other) => (
                <DropdownMenuItem key={other.id} onClick={() => navigate(`/compare?ids=${id},${other.id}`)}>
                  <span className="truncate">{other.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{other.category}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {idea.status === "on_hold" ? (
          <ConfirmButton
            label="Askıdan çıkar"
            title="Fikri askıdan çıkar?"
            description="Fikir tekrar aktif duruma dönecek."
            confirmLabel="Çıkar"
            variant="outline"
            onConfirm={() => handleSetHold("new")}
          />
        ) : (
          <ConfirmButton
            label="Askıya al"
            title="Fikri askıya al?"
            description="Fikir listede soluk görünecek ama kaybolmayacak; istediğin zaman tekrar aktif edebilirsin."
            confirmLabel="Askıya al"
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
            disabled={idea.status === "deleted"}
            onConfirm={() => handleSetHold("on_hold")}
          />
        )}
        <ConfirmButton
          label="Sil"
          title="Fikri sil?"
          description="Fikir listeden tamamen kaldırılır (yalnızca isim tekrarı kontrolü için veritabanında kalır). Bu ekrandan geri alınamaz."
          confirmLabel="Sil"
          variant="destructive"
          confirmVariant="destructive"
          disabled={idea.status === "deleted"}
          onConfirm={handleDelete}
        />
        <Button disabled title="Faz 3'te gelecek">
          Geliştir (yakında)
        </Button>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  // min-w-0: grid/flex öğeleri varsayılan olarak min-width:auto alır, yani
  // içerik (örn. uzun bir kelime) sarmasa bile küçülmeyi reddedip mobilde
  // sayfayı sağa taşırabiliyordu (İlham kaynakları'ndaki uzun url'lerle
  // aynı hizadaki Gelir modeli kartında yaşanan bug buydu). break-words da
  // benzer bir metin için ek güvence.
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 break-words">{children}</CardContent>
    </Card>
  );
}

function ScoreBar({
  label,
  help,
  value,
  reason,
  highlight,
}: {
  label: string;
  help: string;
  value: number;
  reason: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(140px,180px)_1fr_56px] items-center gap-3 text-sm">
      <span className={highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>
        <ScoreReasonPopover label={label} help={help} value={value} reason={reason} />
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-right text-muted-foreground">{value.toFixed(2)}/10</span>
    </div>
  );
}
