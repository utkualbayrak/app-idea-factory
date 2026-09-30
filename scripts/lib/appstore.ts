import { truncate } from "./http";
import type { SourceSection, TrendItem } from "./types";

// Not: Apple'ın eski "customer reviews" RSS'i (itunes.apple.com/.../rss/customerreviews/...)
// test edildi ama artık boş feed dönüyor (entry yok) — kullanılmıyor. Bunun yerine
// top charts + iTunes Lookup API'den gelen puan/oy sayısı "düşük puanlı ama popüler"
// sinyali olarak kullanılıyor.

const COUNTRIES = ["us", "tr"] as const;
const CHART_KINDS = ["top-free", "top-paid"] as const;
const CHART_LIMIT = 25;
const CHART_ITEMS_PER_GROUP = 5; // 2 ülke x 2 liste x 5 = 20 üst sıra öğe
const LOW_RATING_MIN_VOTES = 1000;
const LOW_RATING_COUNT = 8;

interface ChartEntry {
  id: string;
  name: string;
  artistName: string;
  url: string;
}

interface RatingInfo {
  rating: number;
  ratingCount: number;
}

async function fetchChartOnce(country: string, kind: (typeof CHART_KINDS)[number]): Promise<ChartEntry[]> {
  const url = `https://rss.applemarketingtools.com/api/v2/${country}/apps/${kind}/${CHART_LIMIT}/apps.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple ${kind} (${country}) HTTP ${res.status}`);

  const body = (await res.json()) as { feed?: { results?: ChartEntry[] } };
  return body.feed?.results ?? [];
}

// rss.applemarketingtools.com ara sıra geçici 504 dönüyor (test edildi); bir kez
// kısa gecikmeyle tekrar denenir. Yine de başarısız olursa bu tek chart atlanır,
// diğer ülke/liste kombinasyonları etkilenmez.
async function fetchChart(country: string, kind: (typeof CHART_KINDS)[number]): Promise<ChartEntry[]> {
  try {
    return await fetchChartOnce(country, kind);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return fetchChartOnce(country, kind);
  }
}

async function fetchRatings(ids: string[], country: string): Promise<Map<string, RatingInfo>> {
  if (ids.length === 0) return new Map();

  const url = `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes lookup (${country}) HTTP ${res.status}`);

  const body = (await res.json()) as {
    results: { trackId: number; averageUserRating?: number; userRatingCount?: number }[];
  };

  const map = new Map<string, RatingInfo>();
  for (const result of body.results) {
    if (result.averageUserRating != null && result.userRatingCount != null) {
      map.set(String(result.trackId), { rating: result.averageUserRating, ratingCount: result.userRatingCount });
    }
  }
  return map;
}

export async function collectAppStoreSection(): Promise<SourceSection> {
  const chartItems: TrendItem[] = [];
  const allEntries: (ChartEntry & { country: string; kind: string })[] = [];
  const failedCharts: string[] = [];

  for (const country of COUNTRIES) {
    for (const kind of CHART_KINDS) {
      try {
        const entries = await fetchChart(country, kind);
        allEntries.push(...entries.map((entry) => ({ ...entry, country, kind })));
      } catch (err) {
        failedCharts.push(`${kind}/${country}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const ratingsByCountry = new Map<string, Map<string, RatingInfo>>();
  for (const country of COUNTRIES) {
    const ids = allEntries.filter((entry) => entry.country === country).map((entry) => entry.id);
    try {
      ratingsByCountry.set(country, await fetchRatings(ids, country));
    } catch (err) {
      failedCharts.push(`ratings/${country}: ${err instanceof Error ? err.message : String(err)}`);
      ratingsByCountry.set(country, new Map());
    }
  }

  for (const country of COUNTRIES) {
    for (const kind of CHART_KINDS) {
      const topOfGroup = allEntries
        .filter((entry) => entry.country === country && entry.kind === kind)
        .slice(0, CHART_ITEMS_PER_GROUP);

      for (const entry of topOfGroup) {
        const rating = ratingsByCountry.get(entry.country)?.get(entry.id);
        chartItems.push({
          title: entry.name,
          summary: rating
            ? `${entry.artistName} — ${rating.rating.toFixed(1)}★ (${rating.ratingCount} oy)`
            : entry.artistName,
          url: entry.url,
          meta: `${entry.kind} / ${entry.country}`,
        });
      }
    }
  }

  const lowRated = allEntries
    .map((entry) => ({ entry, rating: ratingsByCountry.get(entry.country)?.get(entry.id) }))
    .filter(
      (x): x is { entry: (typeof allEntries)[number]; rating: RatingInfo } =>
        x.rating != null && x.rating.ratingCount >= LOW_RATING_MIN_VOTES,
    )
    .sort((a, b) => a.rating.rating - b.rating.rating)
    .slice(0, LOW_RATING_COUNT)
    .map(({ entry, rating }) => ({
      title: `${entry.name} (düşük puanlı popüler uygulama)`,
      summary: truncate(
        `${entry.artistName} — ${rating.rating.toFixed(1)}★ / ${rating.ratingCount} oy, ${entry.kind} listesinde (${entry.country})`,
        220,
      ),
      url: entry.url,
      meta: `low-rated / ${entry.country}`,
    }));

  return {
    source: "appstore",
    label: "App Store top charts (US, TR)",
    fetchedAt: new Date().toISOString(),
    items: [...lowRated, ...chartItems],
    ...(failedCharts.length > 0 ? { error: failedCharts.join("; ") } : {}),
  };
}
