import type { IdeaInput } from "./schema";

export interface IdeaRow {
  id: string;
  created_at: string;
  batch_date: string;
  name: string;
  one_liner: string;
  problem: string;
  target_audience: string;
  core_features: string;
  monetization: string;
  category: string;
  inspiration_source: string;
  scores: string;
  user_rating: number | null;
  user_note: string | null;
  status: string;
}

export interface Idea extends Omit<IdeaRow, "core_features" | "scores"> {
  core_features: string[];
  scores: IdeaInput["scores"];
}

export function serializeIdea(row: IdeaRow): Idea {
  return {
    ...row,
    core_features: JSON.parse(row.core_features),
    scores: JSON.parse(row.scores),
  };
}
