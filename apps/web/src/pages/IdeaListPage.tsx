import { useEffect, useMemo, useState } from "react";
import { fetchIdeas, type Idea, type IdeaStatus } from "@/lib/api";
import { IdeaTable } from "@/components/IdeaTable";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 'deleted' durumu API'den (GET /ideas) hiç dönmez, bu yüzden filtre
// seçeneklerinde yer almıyor.
const STATUS_LABELS: Record<Exclude<IdeaStatus, "deleted">, string> = {
  new: "Yeni",
  on_hold: "Askıda",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const STORAGE_KEY = "app-idea-factory:idea-list-filters";

interface Filters {
  search: string;
  category: string;
  status: IdeaStatus | "all";
  minRating: string;
  onlyUnrated: boolean;
  minMarket: string;
  minFeasibility: string;
  minOriginality: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  category: "all",
  status: "all",
  minRating: "0",
  onlyUnrated: false,
  minMarket: "0",
  minFeasibility: "0",
  minOriginality: "0",
  dateFrom: "",
  dateTo: "",
};

function loadFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<Filters>) };
  } catch {
    // sessionStorage kullanılamıyorsa (gizli sekme vb.) varsayılana düş.
  }
  return DEFAULT_FILTERS;
}

export function IdeaListPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(loadFilters);

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // yazılamıyorsa filtreler yalnızca bu oturumda state'te kalır.
    }
  }, [filters]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const isFiltered = useMemo(() => JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS), [filters]);

  const categories = useMemo(() => {
    if (!ideas) return [];
    return [...new Set(ideas.map((idea) => idea.category))].sort();
  }, [ideas]);

  const filtered = useMemo(() => {
    if (!ideas) return [];

    let result = ideas;
    const query = filters.search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (idea) =>
          idea.name.toLowerCase().includes(query) ||
          idea.one_liner.toLowerCase().includes(query) ||
          idea.category.toLowerCase().includes(query) ||
          idea.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }
    if (filters.category !== "all") result = result.filter((idea) => idea.category === filters.category);
    if (filters.status !== "all") result = result.filter((idea) => idea.status === filters.status);
    if (filters.minRating !== "0") result = result.filter((idea) => (idea.user_rating ?? 0) >= Number(filters.minRating));
    if (filters.onlyUnrated) result = result.filter((idea) => idea.user_rating == null);
    if (filters.minMarket !== "0") result = result.filter((idea) => idea.scores.market >= Number(filters.minMarket));
    if (filters.minFeasibility !== "0")
      result = result.filter((idea) => idea.scores.feasibility_solo_dev >= Number(filters.minFeasibility));
    if (filters.minOriginality !== "0")
      result = result.filter((idea) => idea.scores.originality >= Number(filters.minOriginality));
    if (filters.dateFrom) result = result.filter((idea) => idea.batch_date >= filters.dateFrom);
    if (filters.dateTo) result = result.filter((idea) => idea.batch_date <= filters.dateTo);

    return result;
  }, [ideas, filters]);

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
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search">Ara</Label>
          <Input
            id="search"
            placeholder="Ad, kategori veya etiket…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label>Kategori</Label>
            <Select value={filters.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="w-full">
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
            <Select value={filters.status} onValueChange={(v) => set("status", v as IdeaStatus | "all")}>
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

          <div className="flex flex-col gap-1.5">
            <Label>Min. kullanıcı puanı</Label>
            <Select value={filters.minRating} onValueChange={(v) => set("minRating", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Hepsi</SelectItem>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}+
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Min. pazar puanı</Label>
            <Select value={filters.minMarket} onValueChange={(v) => set("minMarket", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Hepsi</SelectItem>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}+
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Min. uygulanabilirlik</Label>
            <Select value={filters.minFeasibility} onValueChange={(v) => set("minFeasibility", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Hepsi</SelectItem>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}+
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Min. özgünlük</Label>
            <Select value={filters.minOriginality} onValueChange={(v) => set("minOriginality", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Hepsi</SelectItem>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}+
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tarih aralığı</Label>
            <DateRangeFilter from={filters.dateFrom} to={filters.dateTo} onChange={(from, to) => setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))} />
          </div>

          <div className="col-span-2 flex items-center gap-2 self-end pb-1.5 sm:col-span-1">
            <Checkbox id="only-unrated" checked={filters.onlyUnrated} onCheckedChange={(c) => set("onlyUnrated", c === true)} />
            <Label htmlFor="only-unrated" className="font-normal">
              Yalnızca puanlanmamışlar
            </Label>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={!isFiltered} onClick={() => setFilters(DEFAULT_FILTERS)}>
            Temizle
          </Button>
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
