import { truncate } from "./http";
import type { SourceSection, TrendItem } from "./types";

const ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

const QUERY = `
  query RecentPosts($postedAfter: DateTime!) {
    posts(order: VOTES, postedAfter: $postedAfter, first: 20) {
      edges {
        node {
          name
          tagline
          description
          votesCount
          commentsCount
          url
          topics {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

interface PostNode {
  name: string;
  tagline: string;
  description?: string;
  votesCount: number;
  commentsCount: number;
  url: string;
  topics: { edges: { node: { name: string } }[] };
}

export async function collectProductHuntSection(): Promise<SourceSection> {
  const token = process.env.PRODUCTHUNT_TOKEN;
  const fetchedAt = new Date().toISOString();

  if (!token) {
    return {
      source: "producthunt",
      label: "Product Hunt (son 24 saat)",
      fetchedAt,
      items: [],
      error: "PRODUCTHUNT_TOKEN tanımlı değil, kaynak atlandı",
    };
  }

  const postedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: QUERY, variables: { postedAfter } }),
    });

    if (!res.ok) {
      return {
        source: "producthunt",
        label: "Product Hunt (son 24 saat)",
        fetchedAt,
        items: [],
        error: `Product Hunt API HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as { data?: { posts?: { edges: { node: PostNode }[] } }; errors?: unknown };
    if (body.errors) {
      return {
        source: "producthunt",
        label: "Product Hunt (son 24 saat)",
        fetchedAt,
        items: [],
        error: `Product Hunt API GraphQL hatası: ${JSON.stringify(body.errors)}`,
      };
    }

    const items: TrendItem[] = (body.data?.posts?.edges ?? []).map(({ node }) => {
      const topics = node.topics.edges.map((edge) => edge.node.name).join(", ");
      return {
        title: node.name,
        summary: truncate(`${node.tagline}${node.description ? " — " + node.description : ""}`, 220),
        url: node.url,
        score: node.votesCount,
        meta: topics ? `${node.commentsCount} yorum, konular: ${topics}` : `${node.commentsCount} yorum`,
      };
    });

    return {
      source: "producthunt",
      label: "Product Hunt (son 24 saat)",
      fetchedAt,
      items,
    };
  } catch (err) {
    return {
      source: "producthunt",
      label: "Product Hunt (son 24 saat)",
      fetchedAt,
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
