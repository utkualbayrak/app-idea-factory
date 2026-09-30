import { useEffect, useMemo, useState } from "react";
import { fetchIdeas, type Idea, type IdeaStatus } from "@/lib/api";
import { IdeaTable } from "@/components/IdeaTable";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_LABELS: Record<IdeaStatus, string> = {
  new: "Yeni",
  archived: "Arşivlenmiş",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

export function IdeaListPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<IdeaStatus | "all">("all");
  const [minRating, setMinRating] = useState("0");
  const [onlyUnrated, setOnlyUnrated] = useState(false);

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const categories = useMemo(() => {
    if (!ideas) return [];
    return [...new Set(ideas.map((idea) => idea.category))].sort();
  }, [ideas]);

  const filtered = useMemo(() => {
    if (!ideas) return [];

    let result = ideas;
    if (category !== "all") result = result.filter((idea) => idea.category === category);
    if (status !== "all") result = result.filter((idea) => idea.status === status);
    if (minRating !== "0") result = result.filter((idea) => (idea.user_rating ?? 0) >= Number(minRating));
    if (onlyUnrated) result = result.filter((idea) => idea.user_rating == null);

    return result;
  }, [ideas, category, status, minRating, onlyUnrated]);

  const groups = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const idea of filtered) {
      const list = map.get(idea.batch_date) ?? [];
      list.push(idea);
      map.set(idea.batch_date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (error) return <p className="py-10 text-center text-destructive">Fikirler yüklenemedi: {error}</p>;
  if (!ideas) return <p className="py-10 text-center text-muted-foreground">Yükleniyor…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label>Kategori</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hepsi</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Durum</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as IdeaStatus | "all")}>
            <SelectTrigger className="w-44">
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

        <div className="flex flex-col gap-1.5">
          <Label>Min. puan</Label>
          <Select value={minRating} onValueChange={setMinRating}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Hepsi</SelectItem>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}+ yıldız
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Checkbox id="only-unrated" checked={onlyUnrated} onCheckedChange={(c) => setOnlyUnrated(c === true)} />
          <Label htmlFor="only-unrated" className="font-normal">
            Yalnızca puanlanmamışlar
          </Label>
        </div>
      </div>

      {groups.length === 0 && <p className="py-10 text-center text-muted-foreground">Bu filtrelere uyan fikir yok.</p>}

      {groups.map(([batchDate, batchIdeas]) => (
        <section key={batchDate} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{batchDate}</h2>
          <IdeaTable ideas={batchIdeas} />
        </section>
      ))}
    </div>
  );
}
