import { sleep, truncate } from "./http";
import type { SourceSection, TrendItem } from "./types";

// Resmi Algolia HN Search API — auth gerekmez, ücretsiz. Belgeler: hn.algolia.com/api
const BASE = "https://hn.algolia.com/api/v1";
const REQUEST_DELAY_MS = 300;
const ASK_HN_CAP = 15;
const PHRASE_CAP_PER_QUERY = 6;

// Algolia'nın query parametresi tırnaksız kelime torbası (OR) olarak
// çalışıyor — "is", "there", "app", "that" gibi çok yaygın kelimeler
// yüzünden filtre pratikte hiç uygulanmıyor (test edildi: search_by_date
// alakasız, rastgele son yorumları döndürüyor). Tam ifade eşleşmesi için
// sorgu kendi içinde çift tırnakla sarılmalı. "app that" tırnaklı halde
// bile çok gürültülü çıktı (haftada ~95 sonuç, çoğu alakasız) — kaldırıldı.
const PAINPOINT_PHRASES = ["is there an app", "wish there was", "why is there no app"];

interface AlgoliaHit {
  objectID: string;
  title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at_i: number;
  _tags: string[];
}

async function algoliaSearch(endpoint: "search" | "search_by_date", params: Record<string, string>): Promise<AlgoliaHit[]> {
  const url = `${BASE}/${endpoint}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN Algolia HTTP ${res.status} (${url})`);

  const body = (await res.json()) as { hits: AlgoliaHit[] };
  return body.hits;
}

// HN/Algolia metinleri ham HTML (<p>, <i>, &gt; vb.) içeriyor.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function toTrendItem(hit: AlgoliaHit): TrendItem {
  const isComment = hit._tags.includes("comment");
  const title = hit.title ?? (isComment ? "(HN yorumu)" : "(başlıksız)");
  const body = stripHtml(hit.story_text ?? hit.comment_text ?? "");

  return {
    title,
    summary: truncate(body, 220),
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    score: hit.points ?? 0,
    meta: isComment ? "HN yorum" : `HN gönderi (${hit.num_comments ?? 0} yorum)`,
  };
}

export async function collectHackerNewsSection(): Promise<SourceSection> {
  const fetchedAt = new Date().toISOString();
  const items: TrendItem[] = [];
  const errors: string[] = [];

  const dayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  // Son 24 saatin "Ask HN" gönderileri, popülerliğe göre siralanip kirpiliyor.
  try {
    const hits = await algoliaSearch("search", {
      tags: "ask_hn",
      numericFilters: `created_at_i>${dayAgo}`,
      hitsPerPage: "50",
    });
    const top = [...hits].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).slice(0, ASK_HN_CAP);
    items.push(...top.map(toTrendItem));
  } catch (err) {
    errors.push(`ask_hn: ${err instanceof Error ? err.message : String(err)}`);
  }

  await sleep(REQUEST_DELAY_MS);

  // Son bir haftada gönderi + yorumlarda dert/talep ifadeleri (en yeniden eskiye).
  for (const phrase of PAINPOINT_PHRASES) {
    try {
      const hits = await algoliaSearch("search_by_date", {
        query: `"${phrase}"`,
        numericFilters: `created_at_i>${weekAgo}`,
        hitsPerPage: String(PHRASE_CAP_PER_QUERY),
      });
      items.push(...hits.map(toTrendItem));
    } catch (err) {
      errors.push(`"${phrase}": ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return {
    source: "hackernews",
    label: "Hacker News (Ask HN + arama)",
    fetchedAt,
    items,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  };
}
