const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://app-idea-factory-api.utkualbayrakrak.workers.dev";

export type IdeaStatus = "new" | "archived" | "in_development" | "developed";

export interface IdeaScores {
  market: number;
  feasibility_solo_dev: number;
  originality: number;
  overall: number;
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
  inspiration_source: string;
  scores: IdeaScores;
  user_rating: number | null;
  user_note: string | null;
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
