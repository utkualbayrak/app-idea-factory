import type { Competitor } from "./idea-schema";

const BASE_URL = process.env.API_BASE_URL ?? "https://ideas-api.utkualbayrak.dev";

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

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok || !contentType.includes("application/json")) {
    const bodySnippet = (await res.text()).slice(0, 500);
    throw new Error(
      [
        `İstek başarısız: ${url}`,
        `status=${res.status} redirected=${res.redirected} final_url=${res.url}`,
        `content-type=${contentType || "(yok)"} cf-ray=${res.headers.get("cf-ray") ?? "(yok)"}`,
        `body (ilk 500 karakter): ${bodySnippet}`,
      ].join("\n"),
    );
  }

  return res.json() as Promise<T>;
}

export interface RecentIdea {
  name: string;
  one_liner: string;
  category: string;
}

export async function fetchRecentNames(days = 90): Promise<{ names: string[]; ideas: RecentIdea[] }> {
  const body = await fetchJson<{ names: string[]; ideas?: RecentIdea[] }>(
    `${BASE_URL}/ideas/recent-names?days=${days}`,
    { headers: authHeaders() },
  );
  return { names: body.names, ideas: body.ideas ?? [] };
}

export async function submitIdeasBatch(batchDate: string, ideas: unknown[]): Promise<unknown> {
  return fetchJson(`${BASE_URL}/ideas/batch`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ batch_date: batchDate, ideas }),
  });
}

// Grup 3: ayarlar ekranından kapatılmış kaynakları öğrenmek için (GET
// /admin/settings workflow-secret istemiyor ama Access header'ları yine
// de gerekiyor, authHeaders() ikisini de gönderiyor, zararı yok).
export async function fetchSettings(): Promise<Record<string, boolean>> {
  const body = await fetchJson<{ settings: Record<string, boolean> }>(`${BASE_URL}/admin/settings`, {
    headers: authHeaders(),
  });
  return body.settings;
}

export async function startCronRun(): Promise<string> {
  const body = await fetchJson<{ id: string }>(`${BASE_URL}/admin/cron-runs`, {
    method: "POST",
    headers: authHeaders(),
  });
  return body.id;
}

export async function finishCronRun(
  id: string,
  patch: { status: "success" | "failed"; source_breakdown?: Record<string, number>; error?: string },
): Promise<void> {
  await fetchJson(`${BASE_URL}/admin/cron-runs/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

// Grup 4: notlarla yeniden değerlendirme, rakip bulma, trend_snapshots.
export async function fetchIdeaById(id: string): Promise<unknown> {
  const body = await fetchJson<{ idea: unknown }>(`${BASE_URL}/ideas/${id}`, { headers: authHeaders() });
  return body.idea;
}

export async function submitReevaluation(id: string, data: unknown): Promise<void> {
  await fetchJson(`${BASE_URL}/admin/ideas/${id}/reevaluate`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function submitCompetitors(ideaId: string, competitors: Competitor[]): Promise<void> {
  await fetchJson(`${BASE_URL}/admin/competitors`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ idea_id: ideaId, competitors }),
  });
}

export async function fetchLatestSnapshot(source: string): Promise<{ payload: unknown } | null> {
  const body = await fetchJson<{ snapshot: { payload: unknown } | null }>(
    `${BASE_URL}/admin/trend-snapshots/latest?source=${encodeURIComponent(source)}`,
    { headers: authHeaders() },
  );
  return body.snapshot;
}

export async function submitTrendSnapshots(
  cronRunId: string | undefined,
  snapshots: { source: string; payload: unknown }[],
): Promise<void> {
  await fetchJson(`${BASE_URL}/admin/trend-snapshots`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ cron_run_id: cronRunId, snapshots }),
  });
}

// 2. tur Grup C: fikir bazlı işlerin (reevaluate/find-competitors) Çalışma
// geçmişi kaydı. job_id, Worker'ın tetiklerken oluşturduğu workflow_runs satırı.
export async function patchWorkflowRun(
  jobId: string,
  patch: { status: "running" | "success" | "failed"; run_url?: string; error?: string | null },
): Promise<void> {
  await fetchJson(`${BASE_URL}/admin/workflow-runs/${jobId}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
