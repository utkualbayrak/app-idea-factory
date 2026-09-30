const BASE_URL = process.env.API_BASE_URL ?? "https://app-idea-factory-api.utkualbayrakrak.workers.dev";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env değişkeni tanımlı değil`);
  return value;
}

// Worker'ın çağırdığı uçlar hem Cloudflare Access (service token) hem de
// paylaşılan anahtar ile korunuyor — bkz. docs/PROJE.md "Güvenlik".
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Workflow-Secret": requireEnv("WORKFLOW_API_SHARED_SECRET"),
  };

  const clientId = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (clientId && clientSecret) {
    headers["CF-Access-Client-Id"] = clientId;
    headers["CF-Access-Client-Secret"] = clientSecret;
  }

  return headers;
}

export async function fetchRecentNames(days = 90): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/ideas/recent-names?days=${days}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`GET /ideas/recent-names HTTP ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { names: string[] };
  return body.names;
}

export async function submitIdeasBatch(batchDate: string, ideas: unknown[]): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/ideas/batch`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ batch_date: batchDate, ideas }),
  });

  if (!res.ok) {
    throw new Error(`POST /ideas/batch HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}
