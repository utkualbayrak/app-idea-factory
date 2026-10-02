import { resolveTargets, type DocumentKind, type IdeaInput, type TaskParams, type TaskStatus } from "./schema";

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
  last_activity_at: string | null;
  last_activity_kind: string | null;
  activity_seen_at: string | null;
  status: string;
  origin: "cron" | "manual" | "merge";
  source_text: string | null;
  /** 0013 trigger'ı yazar; o tarihten sonra eklenip durumu hiç değişmemiş fikirde null. */
  status_changed_at: string | null;
  /** 0014: yalnızca kullanıcı değişiklikleri; eski satırlarda null. */
  updated_at: string | null;
  updated_by: string | null;
  /** Aktiviteyi kim tetikledi (e-posta ya da 'system'). */
  last_activity_by: string | null;
  /** 0016, havuz bakımı: birleşik fikir ya da özellik önerisinin hedefi. */
  merged_into_id: string | null;
  /** Art arda kaç bakım koşusunda bakım puanı 7.00'ın altında kaldı. */
  stale_runs: number;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface Idea
  extends Omit<IdeaRow, "core_features" | "inspiration_sources" | "tags" | "scores"> {
  core_features: string[];
  inspiration_sources: string[];
  tags: string[];
  /** null: elle girilmiş, henüz puanlanmamış fikir (D1'de JSON 'null'). */
  scores: IdeaInput["scores"] | null;
}

export function serializeIdea(row: IdeaRow): Idea {
  return {
    ...row,
    created_at: toUtcIso(row.created_at),
    user_note_updated_at: toUtcIso(row.user_note_updated_at),
    last_reevaluated_at: toUtcIso(row.last_reevaluated_at),
    last_activity_at: toUtcIso(row.last_activity_at),
    activity_seen_at: toUtcIso(row.activity_seen_at),
    status_changed_at: toUtcIso(row.status_changed_at),
    updated_at: toUtcIso(row.updated_at),
    archived_at: toUtcIso(row.archived_at),
    deleted_at: toUtcIso(row.deleted_at),
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
  kind: "daily" | "merge";
  summary: string | null;
  run_url: string | null;
}

export interface CronRun extends Omit<CronRunRow, "source_breakdown" | "summary"> {
  source_breakdown: Record<string, number> | null;
  summary: Record<string, number> | null;
}

export function serializeCronRun(row: CronRunRow): CronRun {
  return {
    ...row,
    started_at: toUtcIso(row.started_at),
    finished_at: toUtcIso(row.finished_at),
    source_breakdown: row.source_breakdown ? JSON.parse(row.source_breakdown) : null,
    summary: row.summary ? JSON.parse(row.summary) : null,
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

export interface WorkflowRunRow {
  id: string;
  workflow: string;
  idea_id: string;
  status: "queued" | "running" | "success" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  run_url: string | null;
  error: string | null;
  // GET /admin/workflow-runs JOIN ile ekler (fikir silinmişse de satır kalır).
  idea_name?: string | null;
}

export interface TaskRow {
  id: string;
  idea_id: string;
  created_at: string;
  updated_at: string;
  params: string;
  status: TaskStatus;
  repo_url: string | null;
  issue_url: string | null;
  project_item_id: string | null;
  workflow_run_id: string | null;
  error: string | null;
  updated_by: string | null;
}

export interface Task extends Omit<TaskRow, "params"> {
  params: TaskParams;
}

// Grup 6'dan önceki görevlerde targets yok; platformdan türetilir.
function parseTaskParams(raw: string): TaskParams {
  const params = JSON.parse(raw) as Omit<TaskParams, "targets"> & { targets?: TaskParams["targets"] };
  return { ...params, targets: resolveTargets(params.platform, params.targets) };
}

export function serializeTask(row: TaskRow): Task {
  return {
    ...row,
    created_at: toUtcIso(row.created_at),
    updated_at: toUtcIso(row.updated_at),
    params: parseTaskParams(row.params),
  };
}

export interface TaskDocumentRow {
  task_id: string;
  kind: DocumentKind;
  content: string;
  generated_at: string;
  user_edited_at: string | null;
  edited_by: string | null;
}

export function serializeTaskDocument(row: TaskDocumentRow): TaskDocumentRow {
  return { ...row, generated_at: toUtcIso(row.generated_at), user_edited_at: toUtcIso(row.user_edited_at) };
}

// Havuz bakımı önerileri (0016).
export interface ProposalRow {
  id: string;
  run_id: string | null;
  kind: "merge" | "feature";
  status: "pending" | "applied" | "rejected" | "undone";
  auto_applied: number;
  source_ids: string;
  source_prev_statuses: string | null;
  target_idea_id: string | null;
  payload: string;
  reason: string;
  error: string | null;
  issue_url: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface Proposal
  extends Omit<ProposalRow, "auto_applied" | "source_ids" | "source_prev_statuses" | "payload"> {
  auto_applied: boolean;
  source_ids: string[];
  source_prev_statuses: Record<string, string> | null;
  payload: unknown;
}

export function serializeProposal(row: ProposalRow): Proposal {
  return {
    ...row,
    auto_applied: row.auto_applied === 1,
    source_ids: JSON.parse(row.source_ids),
    source_prev_statuses: row.source_prev_statuses ? JSON.parse(row.source_prev_statuses) : null,
    payload: JSON.parse(row.payload),
    created_at: toUtcIso(row.created_at),
    decided_at: toUtcIso(row.decided_at),
  };
}
