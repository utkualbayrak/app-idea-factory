const USER_AGENT = "app-idea-factory-trend-bot/0.2 (github.com/utkualbayrak/app-idea-factory)";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

// "script" tipi Reddit app + client_credentials grant: kullanıcı context'i
// gerekmeyen, salt okuma amaçlı app-level OAuth token'ı. docs/PROJE.md
// "Trend toplama detayları" bölümüne bakınız.
export async function getRedditAccessToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 30_000) {
    return cache.accessToken;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET tanımlı değil");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Reddit OAuth token isteği başarısız: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cache = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cache.accessToken;
}

export { USER_AGENT as REDDIT_USER_AGENT };
