import { sleep, truncate } from "./http";
import type { SourceSection, TrendItem } from "./types";

// docs/PROJE.md: Reddit'in resmi API'si kullanılmıyor (public .json/.rss
// endpoint'leri). Kullanım şartları ve rate-limit riski var; GitHub Actions
// gibi veri merkezi IP'lerinden 403/429 gelebilir, bu yüzden .rss fallback'i var.
const USER_AGENT = "app-idea-factory-trend-bot/0.1 (github.com/utkualbayrak/app-idea-factory)";
const REQUEST_DELAY_MS = 1500;

interface RedditGroupConfig {
  id: string;
  label: string;
  method: "top" | "search";
  time: string;
  sort?: string;
  perSubredditLimit: number;
  groupCap: number;
  subreddits: string[];
  searchTerms?: string[];
}

export interface SubredditsConfig {
  groups: RedditGroupConfig[];
}

interface RawRedditPost {
  title: string;
  selftext?: string;
  score: number;
  num_comments: number;
  permalink: string;
  subreddit: string;
}

// Reddit'in anonim rate-limit'i gözlemlenen ortamlarda çok dar olabiliyor
// (bkz. docs/PROJE.md "Trend toplama detayları"). 429 gelirse `x-ratelimit-reset`
// başlığı kadar (üst sınır MAX_BACKOFF_MS) bekleyip bir kez daha denenir.
const MAX_BACKOFF_MS = 40_000;

async function fetchWithBackoff(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, { headers });
  if (res.status !== 429) return res;

  const resetSeconds = Number(res.headers.get("x-ratelimit-reset") ?? res.headers.get("retry-after") ?? "5");
  const waitMs = Math.min(Math.max(resetSeconds, 1) * 1000 + 500, MAX_BACKOFF_MS);
  await sleep(waitMs);

  return fetch(url, { headers });
}

async function fetchJson(url: string): Promise<{ posts: RawRedditPost[]; degraded: boolean } | null> {
  const res = await fetchWithBackoff(url, { "User-Agent": USER_AGENT, Accept: "application/json" });
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: { children?: { data: RawRedditPost }[] } };
  const posts = (body.data?.children ?? []).map((child) => child.data);
  return { posts, degraded: false };
}

function parseAtomEntries(xml: string, subreddit: string): RawRedditPost[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.map((entry) => {
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
    return {
      title: decodeXmlEntities(title),
      selftext: "",
      score: 0,
      num_comments: 0,
      permalink: link,
      subreddit,
    };
  });
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchWithRssFallback(
  jsonUrl: string,
  rssUrl: string,
  subreddit: string,
): Promise<{ posts: RawRedditPost[]; degraded: boolean }> {
  const jsonResult = await fetchJson(jsonUrl);
  if (jsonResult) return jsonResult;

  const rssRes = await fetchWithBackoff(rssUrl, { "User-Agent": USER_AGENT });
  if (!rssRes.ok) return { posts: [], degraded: true };

  const xml = await rssRes.text();
  return { posts: parseAtomEntries(xml, subreddit), degraded: true };
}

function toTrendItem(post: RawRedditPost): TrendItem {
  const url = post.permalink.startsWith("http") ? post.permalink : `https://www.reddit.com${post.permalink}`;
  return {
    title: post.title,
    summary: truncate(post.selftext ?? "", 220),
    url,
    score: post.score,
    meta: `r/${post.subreddit}`,
  };
}

async function collectTopGroup(group: RedditGroupConfig): Promise<SourceSection> {
  const items: TrendItem[] = [];
  let anyDegraded = false;

  for (const subreddit of group.subreddits) {
    const jsonUrl = `https://www.reddit.com/r/${subreddit}/top.json?t=${group.time}&limit=${group.perSubredditLimit}`;
    const rssUrl = `https://www.reddit.com/r/${subreddit}/top.rss?t=${group.time}&limit=${group.perSubredditLimit}`;

    const { posts, degraded } = await fetchWithRssFallback(jsonUrl, rssUrl, subreddit);
    anyDegraded = anyDegraded || degraded;
    items.push(...posts.map(toTrendItem));

    await sleep(REQUEST_DELAY_MS);
  }

  const top = items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, group.groupCap);

  return {
    source: group.id,
    label: group.label,
    fetchedAt: new Date().toISOString(),
    items: top,
    ...(anyDegraded ? { error: "bazı subreddit'lerde .json engellendi, .rss fallback kullanıldı" } : {}),
  };
}

async function collectSearchGroup(group: RedditGroupConfig): Promise<SourceSection> {
  const items: TrendItem[] = [];
  let anyDegraded = false;
  const query = (group.searchTerms ?? []).map((term) => `"${term}"`).join(" OR ");

  for (const subreddit of group.subreddits) {
    const params = `q=${encodeURIComponent(query)}&restrict_sr=1&sort=${group.sort}&t=${group.time}&limit=${group.perSubredditLimit}`;
    const jsonUrl = `https://www.reddit.com/r/${subreddit}/search.json?${params}`;
    const rssUrl = `https://www.reddit.com/r/${subreddit}/search.rss?${params}`;

    const { posts, degraded } = await fetchWithRssFallback(jsonUrl, rssUrl, subreddit);
    anyDegraded = anyDegraded || degraded;
    items.push(...posts.map(toTrendItem));

    await sleep(REQUEST_DELAY_MS);
  }

  return {
    source: group.id,
    label: group.label,
    fetchedAt: new Date().toISOString(),
    items: items.slice(0, group.groupCap),
    ...(anyDegraded ? { error: "bazı subreddit'lerde .json engellendi, .rss fallback kullanıldı" } : {}),
  };
}

export async function collectRedditGroups(config: SubredditsConfig): Promise<SourceSection[]> {
  const sections: SourceSection[] = [];

  for (const group of config.groups) {
    try {
      const section = group.method === "search" ? await collectSearchGroup(group) : await collectTopGroup(group);
      sections.push(section);
    } catch (err) {
      sections.push({
        source: group.id,
        label: group.label,
        fetchedAt: new Date().toISOString(),
        items: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return sections;
}
