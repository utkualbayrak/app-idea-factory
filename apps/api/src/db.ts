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
  inspiration_sources: string;
  tags: string;
  scores: string;
  user_rating: number | null;
  user_note: string | null;
  user_note_updated_at: string | null;
  last_reevaluated_at: string | null;
  status: string;
}

export interface Idea
  extends Omit<IdeaRow, "core_features" | "inspiration_sources" | "tags" | "scores"> {
  core_features: string[];
  inspiration_sources: string[];
  tags: string[];
  scores: IdeaInput["scores"];
}

export function serializeIdea(row: IdeaRow): Idea {
  return {
    ...row,
    core_features: JSON.parse(row.core_features),
    inspiration_sources: JSON.parse(row.inspiration_sources),
    tags: JSON.parse(row.tags),
    scores: JSON.parse(row.scores),
  };
}
