import type { IdeaInput } from "./schema";

// SQLite'ın datetime('now') default'u UTC ama "YYYY-MM-DD HH:MM:SS" formatında,
// saat dilimi işareti olmadan yazıyor. Tarayıcı bunu yerel saat (TR, +3) sanıp
// 3 saat kaydırıyordu (cron geçmişinde 20 dk'lık iş 3 sa 20 dk görünüyordu).
// Bu helper o formatı Z'li ISO'ya çevirir; zaten ISO olan değere dokunmaz.
const SQLITE_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function toUtcIso<T extends string | null>(value: T): T {
  if (value == null || !SQLITE_DATETIME.test(value)) return value;
  return `${value.replace(" ", "T")}Z` as T;
}

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
  last_reevaluation_summary: string | null;
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
    created_at: toUtcIso(row.created_at),
    user_note_updated_at: toUtcIso(row.user_note_updated_at),
    last_reevaluated_at: toUtcIso(row.last_reevaluated_at),
    core_features: JSON.parse(row.core_features),
    inspiration_sources: JSON.parse(row.inspiration_sources),
    tags: JSON.parse(row.tags),
    scores: JSON.parse(row.scores),
  };
}

export interface CronRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  source_breakdown: string | null;
  error: string | null;
}

export interface CronRun extends Omit<CronRunRow, "source_breakdown"> {
  source_breakdown: Record<string, number> | null;
}

export function serializeCronRun(row: CronRunRow): CronRun {
  return {
    ...row,
    started_at: toUtcIso(row.started_at),
    finished_at: toUtcIso(row.finished_at),
    source_breakdown: row.source_breakdown ? JSON.parse(row.source_breakdown) : null,
  };
}

export interface CompetitorRow {
  id: string;
  idea_id: string;
  app_name: string;
  url: string | null;
  similarity: "direct" | "partial" | "alternative" | null;
  note: string | null;
  created_at: string;
}

export function serializeCompetitor(row: CompetitorRow): CompetitorRow {
  return { ...row, created_at: toUtcIso(row.created_at) };
}

export interface TrendSnapshotRow {
  id: string;
  fetched_at: string;
  source: string;
  payload: string;
  cron_run_id: string | null;
}

export interface TrendSnapshot extends Omit<TrendSnapshotRow, "payload"> {
  payload: unknown;
}

export function serializeTrendSnapshot(row: TrendSnapshotRow): TrendSnapshot {
  return { ...row, fetched_at: toUtcIso(row.fetched_at), payload: JSON.parse(row.payload) };
}
