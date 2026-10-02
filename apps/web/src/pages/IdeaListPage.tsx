import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { fetchIdeas, type Idea } from "@/lib/api";
import { IdeaTable } from "@/components/IdeaTable";
import { isInIdeaPool } from "@/lib/idea-colors";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ListPageLayout, PageHeader, PageMessage } from "@/components/PageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MAX_COMPARE = 4;

// 'deleted' API'den hiç dönmez; "Geliştir" denmiş fikirler (awaiting_development /
// in_development / developed) ise bu listede hiç görünmüyor (/developed
// ekranında), bu yüzden filtre seçeneklerinde de yok.
const STATUS_LABELS: Record<"new" | "on_hold", string> = {
  new: "Yeni",
  on_hold: "Askıda",
};

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const STORAGE_KEY = "app-idea-factory:idea-list-filters";

interface Filters {
  search: string;
  category: string;
  status: "new" | "on_hold" | "all";
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
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
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

  // Geliştirme/test akışına giren fikirler ana listeden tamamen çıkar,
  // kendi ekranlarında (/developed, /testing, /ready) görünür.
  const activeIdeas = useMemo(
    () => (ideas ?? []).filter((idea) => isInIdeaPool(idea.status)),
    [ideas],
  );

  const categories = useMemo(
    () => [...new Set(activeIdeas.map((idea) => idea.category))].sort(),
    [activeIdeas],
  );

  const filtered = useMemo(() => {
    let result = activeIdeas;
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
    if (filters.minMarket !== "0") result = result.filter((idea) => (idea.scores?.market ?? -1) >= Number(filters.minMarket));
    if (filters.minFeasibility !== "0")
      result = result.filter((idea) => (idea.scores?.feasibility_solo_dev ?? -1) >= Number(filters.minFeasibility));
    if (filters.minOriginality !== "0")
      result = result.filter((idea) => (idea.scores?.originality ?? -1) >= Number(filters.minOriginality));
    if (filters.dateFrom) result = result.filter((idea) => idea.batch_date >= filters.dateFrom);
    if (filters.dateTo) result = result.filter((idea) => idea.batch_date <= filters.dateTo);

    return result;
  }, [activeIdeas, filters]);


  const header = (
    <PageHeader
      title="Fikirler"
      description="Yeni ve askıdaki fikirler. Geliştirilenler ayrı ekranda."
      actions={
        <Button asChild>
          <Link to="/ideas/new">
            <Plus className="size-4" />
            Fikir ekle
          </Link>
        </Button>
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
            <Select value={filters.status} onValueChange={(v) => set("status", v as "new" | "on_hold" | "all")}>
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

      <IdeaTable
        ideas={filtered}
        totalCount={activeIdeas.length}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        selectionFull={selectedIds.size >= MAX_COMPARE}
      />

      {/* Sayfa artık kaymadığı için sticky değil, tablonun altında akışta duruyor:
          görününce tablo kısalır, hiçbir satırın üstünü kapatmaz. */}
      {selectedIds.size > 0 && (
        <div className="mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} fikir seçildi{selectedIds.size >= MAX_COMPARE ? ` (maks. ${MAX_COMPARE})` : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Temizle
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.size < 2}
            onClick={() => navigate(`/compare?ids=${[...selectedIds].join(",")}`)}
          >
            Karşılaştır
          </Button>
        </div>
      )}
    </ListPageLayout>
  );
}
