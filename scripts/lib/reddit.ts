import { sleep, truncate } from "./http";
import { getRedditAccessToken, REDDIT_USER_AGENT } from "./reddit-auth";
import type { SourceSection, TrendItem } from "./types";

// docs/PROJE.md: Reddit'in resmi OAuth API'si kullanılıyor ("script" tipi app +
// client_credentials grant, bkz. reddit-auth.ts). Public .json/.rss'e kıyasla çok
// daha güvenilir (gerçek skor/yorum/gövde metni, çok daha gevşek rate limit).
const REQUEST_DELAY_MS = 500;
const MAX_BACKOFF_MS = 40_000;

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

async function fetchWithBackoff(url: string, token: string): Promise<Response> {
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": REDDIT_USER_AGENT };
  const res = await fetch(url, { headers });
  if (res.status !== 429) return res;

  const resetSeconds = Number(res.headers.get("x-ratelimit-reset") ?? res.headers.get("retry-after") ?? "5");
  const waitMs = Math.min(Math.max(resetSeconds, 1) * 1000 + 500, MAX_BACKOFF_MS);
  await sleep(waitMs);

  return fetch(url, { headers });
}

async function fetchPosts(url: string, token: string): Promise<RawRedditPost[]> {
  const res = await fetchWithBackoff(url, token);
  if (!res.ok) throw new Error(`Reddit API HTTP ${res.status} (${url})`);

  const body = (await res.json()) as { data?: { children?: { data: RawRedditPost }[] } };
  return (body.data?.children ?? []).map((child) => child.data);
}

function toTrendItem(post: RawRedditPost): TrendItem {
  const url = post.permalink.startsWith("http") ? post.permalink : `https://www.reddit.com${post.permalink}`;
  return {
    title: post.title,
    summary: truncate(post.selftext ?? "", 220),
    url,
    score: post.score,
    meta: `r/${post.subreddit} (${post.num_comments} yorum)`,
  };
}

async function collectTopGroup(group: RedditGroupConfig, token: string): Promise<SourceSection> {
  const items: TrendItem[] = [];
  const failedSubreddits: string[] = [];

  for (const subreddit of group.subreddits) {
    const url = `https://oauth.reddit.com/r/${subreddit}/top?t=${group.time}&limit=${group.perSubredditLimit}`;
    try {
      const posts = await fetchPosts(url, token);
      items.push(...posts.map(toTrendItem));
    } catch (err) {
      failedSubreddits.push(`r/${subreddit}: ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const top = items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, group.groupCap);

  return {
    source: group.id,
    label: group.label,
    fetchedAt: new Date().toISOString(),
    items: top,
    ...(failedSubreddits.length > 0 ? { error: failedSubreddits.join("; ") } : {}),
  };
}

async function collectSearchGroup(group: RedditGroupConfig, token: string): Promise<SourceSection> {
  const items: TrendItem[] = [];
  const failedSubreddits: string[] = [];
  const query = (group.searchTerms ?? []).map((term) => `"${term}"`).join(" OR ");

  for (const subreddit of group.subreddits) {
    const params = `q=${encodeURIComponent(query)}&restrict_sr=1&sort=${group.sort}&t=${group.time}&limit=${group.perSubredditLimit}`;
    const url = `https://oauth.reddit.com/r/${subreddit}/search?${params}`;

    try {
      const posts = await fetchPosts(url, token);
      items.push(...posts.map(toTrendItem));
    } catch (err) {
      failedSubreddits.push(`r/${subreddit}: ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return {
    source: group.id,
    label: group.label,
    fetchedAt: new Date().toISOString(),
    items: items.slice(0, group.groupCap),
    ...(failedSubreddits.length > 0 ? { error: failedSubreddits.join("; ") } : {}),
  };
}

export async function collectRedditGroups(config: SubredditsConfig): Promise<SourceSection[]> {
  let token: string;
  try {
    token = await getRedditAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return config.groups.map((group) => ({
      source: group.id,
      label: group.label,
      fetchedAt: new Date().toISOString(),
      items: [],
      error: `Reddit OAuth token alınamadı, kaynak atlandı: ${message}`,
    }));
  }

  const sections: SourceSection[] = [];
  for (const group of config.groups) {
    try {
      const section =
        group.method === "search" ? await collectSearchGroup(group, token) : await collectTopGroup(group, token);
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
