// Production'da /api altına gelen istekler, web Worker'ın kendi fetch
// handler'ı (worker/index.ts) tarafından sunucu tarafında API Worker'a
// proxy'lenir — tarayıcı için her zaman same-origin, CORS/Access-oturumu
// karmaşası yok. Yerel geliştirmede .env.development bunu ezip doğrudan
// yerel API'ye (http://localhost:8787) bağlanır.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type IdeaStatus = "new" | "on_hold" | "deleted" | "in_development" | "developed";

export interface IdeaScores {
  market: number;
  market_reason: string;
  feasibility_solo_dev: number;
  feasibility_solo_dev_reason: string;
  originality: number;
  originality_reason: string;
  overall: number;
  overall_reason: string;
}

export interface Idea {
  id: string;
  created_at: string;
  batch_date: string;
  name: string;
  one_liner: string;
  problem: string;
  target_audience: string;
  core_features: string[];
  monetization: string;
  category: string;
  inspiration_sources: string[];
  tags: string[];
  scores: IdeaScores;
  user_rating: number | null;
  user_note: string | null;
  user_note_updated_at: string | null;
  last_reevaluated_at: string | null;
  last_reevaluation_summary: string | null;
  status: IdeaStatus;
}

export interface IdeaPatch {
  user_rating?: number | null;
  user_note?: string | null;
  status?: IdeaStatus;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    throw new Error(`API isteği başarısız: ${path} (HTTP ${res.status})`);
  }

  return res.json() as Promise<T>;
}

export function fetchIdeas(): Promise<{ ideas: Idea[] }> {
  return request("/ideas");
}

export function fetchIdea(id: string): Promise<{ idea: Idea }> {
  return request(`/ideas/${id}`);
}

export function patchIdea(id: string, patch: IdeaPatch): Promise<{ idea: Idea }> {
  return request(`/ideas/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

// Grup 3: ayarlar ekranı ve cron geçmişi.
export type SourceSettingKey =
  | "source_reddit_enabled"
  | "source_appstore_enabled"
  | "source_producthunt_enabled"
  | "source_hackernews_enabled";

export interface CronRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  source_breakdown: Record<string, number> | null;
  error: string | null;
}

export function fetchSettings(): Promise<{ settings: Record<SourceSettingKey, boolean> }> {
  return request("/admin/settings");
}

export function patchSettings(key: SourceSettingKey, value: boolean): Promise<{ ok: true }> {
  return request("/admin/settings", { method: "PATCH", body: JSON.stringify({ key, value }) });
}

export type DispatchableWorkflow = "daily-ideas.yml" | "reevaluate-idea.yml" | "find-competitors.yml";

export function triggerWorkflow(workflow: DispatchableWorkflow, inputs?: Record<string, string>): Promise<{ ok: true }> {
  return request("/admin/trigger-workflow", { method: "POST", body: JSON.stringify({ workflow, inputs }) });
}

export function fetchCronRuns(limit = 30): Promise<{ runs: CronRun[] }> {
  return request(`/admin/cron-runs?limit=${limit}`);
}

export interface TrendSnapshot {
  id: string;
  fetched_at: string;
  source: string;
  payload: unknown;
  cron_run_id: string | null;
}

export function fetchTrendSnapshots(cronRunId: string): Promise<{ snapshots: TrendSnapshot[] }> {
  return request(`/admin/trend-snapshots?cron_run_id=${cronRunId}`);
}

// Grup 4: notlarla yeniden değerlendirme + rakip bulma (ikisi de arka
// planda bir GitHub workflow'u tetikler, sonuç birkaç dakika sonra gelir).
export interface Competitor {
  id: string;
  idea_id: string;
  app_name: string;
  url: string | null;
  // Eski (prompt güncellemesi öncesi) kayıtlarda null.
  similarity: "direct" | "partial" | "alternative" | null;
  note: string | null;
  created_at: string;
}

export function fetchCompetitors(ideaId: string): Promise<{ competitors: Competitor[] }> {
  return request(`/ideas/${ideaId}/competitors`);
}
