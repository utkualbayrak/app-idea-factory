// Production'da /api altına gelen istekler, web Worker'ın kendi fetch
// handler'ı (worker/index.ts) tarafından sunucu tarafında API Worker'a
// proxy'lenir — tarayıcı için her zaman same-origin, CORS/Access-oturumu
// karmaşası yok. Yerel geliştirmede .env.development bunu ezip doğrudan
// yerel API'ye (http://localhost:8787) bağlanır.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type IdeaStatus =
  | "new"
  | "on_hold"
  | "deleted"
  | "awaiting_development"
  | "in_development"
  | "rework"
  | "awaiting_test"
  | "testing"
  | "approved";

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
  /** null: elle girilmiş, henüz puanlanmamış fikir. */
  scores: IdeaScores | null;
  user_rating: number | null;
  user_note: string | null;
  user_note_updated_at: string | null;
  last_reevaluated_at: string | null;
  last_reevaluation_summary: string | null;
  last_activity_at: string | null;
  last_activity_kind: ActivityKind | null;
  activity_seen_at: string | null;
  status: IdeaStatus;
  origin: "cron" | "manual";
  /** "Açıklama yaz, Claude doldursun" yolunda kullanıcının yazdığı metin. */
  source_text: string | null;
  /** Son durum değişikliği; null ise durum oluşturulduğundan beri aynı (created_at'e bak). */
  status_changed_at: string | null;
  /** Son kullanıcı değişikliği (e-posta); Claude'un sonuçları burada değil. */
  updated_at: string | null;
  updated_by: string | null;
  /** Son aktiviteyi kim tetikledi: e-posta ya da "system". */
  last_activity_by: string | null;
}

// apps/api/src/schema.ts ACTIVITY_KINDS ile aynı.
export type ActivityKind =
  | "note_updated"
  | "rating_updated"
  | "status_changed"
  | "reevaluate_queued"
  | "reevaluated"
  | "reevaluate_failed"
  | "competitors_queued"
  | "competitors_found"
  | "competitors_failed"
  | "plan_queued"
  | "planned"
  | "plan_failed"
  | "evaluate_queued"
  | "evaluated"
  | "evaluate_failed"
  | "skeleton_queued"
  | "skeleton_built"
  | "skeleton_failed";

export interface IdeaPatch {
  user_rating?: number | null;
  user_note?: string | null;
  status?: IdeaStatus;
  mark_seen?: true;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    // API okunur bir sebep döndürdüyse ({ message }) onu da ekle.
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const detail = typeof body?.message === "string" ? ` — ${body.message}` : "";
    throw new Error(`API isteği başarısız: ${path} (HTTP ${res.status})${detail}`);
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

// Ayarlar > Kullanıcılar: Access e-postası → görünen ad. display_name null:
// kayıtlarda geçen ama henüz adlandırılmamış e-posta.
export interface UserName {
  email: string;
  display_name: string | null;
  updated_at: string | null;
}

export function fetchUserNames(): Promise<{ users: UserName[]; me: string | null }> {
  return request("/admin/user-names");
}

export function putUserName(email: string, displayName: string): Promise<{ user: UserName }> {
  return request(`/admin/user-names/${encodeURIComponent(email)}`, {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export function deleteUserName(email: string): Promise<{ ok: true }> {
  return request(`/admin/user-names/${encodeURIComponent(email)}`, { method: "DELETE" });
}

export type DispatchableWorkflow =
  | "daily-ideas.yml"
  | "reevaluate-idea.yml"
  | "find-competitors.yml"
  | "evaluate-idea.yml";

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

// 2. tur Grup C: fikir bazlı işlerin geçmişi (Çalışma geçmişi > Fikir işleri).
export type IdeaWorkflow =
  | "reevaluate-idea.yml"
  | "find-competitors.yml"
  | "plan-idea.yml"
  | "build-skeleton.yml"
  | "evaluate-idea.yml";

export interface WorkflowRun {
  id: string;
  workflow: IdeaWorkflow;
  idea_id: string;
  idea_name: string | null;
  status: "queued" | "running" | "success" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  run_url: string | null;
  error: string | null;
}

export function fetchWorkflowRuns(options: { limit?: number; ideaId?: string } = {}): Promise<{ runs: WorkflowRun[] }> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 100) });
  if (options.ideaId) params.set("idea_id", options.ideaId);
  return request(`/admin/workflow-runs?${params}`);
}

// Faz 3A: "Geliştir" görev formu + Claude'un ürettiği planlama belgeleri.
// apps/api/src/schema.ts taskParamsSchema ile aynı.
export type TaskPlatform = "ios_swift" | "android_kotlin" | "expo" | "flutter";
export type TaskBackend = "none" | "supabase" | "firebase" | "custom_api";
export type TaskAuth = "none" | "email" | "social";
export type TaskTheme = "light" | "dark" | "both";
export type TaskStyle = "minimal" | "colorful";
export type TaskTarget = "ios" | "android";

export interface TaskParams {
  platform: TaskPlatform;
  /** API her zaman doldurur (eski görevlerde platformdan türetir); gönderirken native'de yok sayılır. */
  targets: TaskTarget[];
  backend: TaskBackend;
  auth: TaskAuth;
  mvp_features: string[];
  design: { theme: TaskTheme; style: TaskStyle };
  notes?: string;
}

export type TaskStatus = "planning" | "planning_failed" | "ready" | "queued" | "running" | "done" | "failed";

export interface Task {
  id: string;
  idea_id: string;
  created_at: string;
  updated_at: string;
  params: TaskParams;
  status: TaskStatus;
  repo_url: string | null;
  issue_url: string | null;
  error: string | null;
  updated_by: string | null;
}

export type DocumentKind = "prd" | "screens" | "tech_plan" | "roadmap";

export interface TaskDocument {
  task_id: string;
  kind: DocumentKind;
  content: string;
  generated_at: string;
  user_edited_at: string | null;
  edited_by: string | null;
}

// Faz 3 sonrası tur, Grup 2: iskelet reposuyla senkron.
export interface RepoCommit {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
}

export interface RepoChange {
  path: string;
  change: "added" | "modified" | "removed";
}

export interface RepoSync {
  synced_at: string;
  head_sha: string | null;
  previous_head_sha: string | null;
  commits: RepoCommit[];
  changes: RepoChange[];
  pending_count: number;
  synced_by: string | null;
}

export interface RepoFile {
  path: string;
  size: number;
  /** null: dosya çekilemeyecek kadar büyük. */
  content: string | null;
  /** Bir önceki senkrondaki içerik (dosya o senkronda değiştiyse). */
  previous_content: string | null;
  first_seen_at: string;
  changed_at: string;
}

export interface RepoState {
  last_sync: RepoSync | null;
  files: RepoFile[];
}

export function fetchIdeaTask(
  ideaId: string,
): Promise<{ task: Task | null; documents: TaskDocument[]; repo: RepoState | null }> {
  return request(`/ideas/${ideaId}/task`);
}

export function syncTaskRepo(taskId: string): Promise<{ repo: RepoState }> {
  return request(`/tasks/${taskId}/sync`, { method: "POST" });
}

// Formu kaydeder, fikri "Geliştirme bekliyor"a alır ve belge üretimini tetikler.
// planning_failed / ready durumundaki bir görev için tekrar çağrılırsa
// parametreleri günceller ve belgeleri yeniden üretir.
export function createTask(ideaId: string, params: TaskParams): Promise<{ task: Task }> {
  return request("/tasks", { method: "POST", body: JSON.stringify({ idea_id: ideaId, params }) });
}

// Faz 3B: belge düzenleme (yalnızca görev 'ready' iken) ve iskelet üretimini
// başlatma / tekrar deneme (ready veya failed).
export function patchTaskDocument(taskId: string, kind: DocumentKind, content: string): Promise<{ document: TaskDocument }> {
  return request(`/tasks/${taskId}/documents/${kind}`, { method: "PATCH", body: JSON.stringify({ content }) });
}

export function startBuild(taskId: string): Promise<{ task: Task }> {
  return request(`/tasks/${taskId}/build`, { method: "POST" });
}

// Faz 3 sonrası tur, Grup 3: "Geliştirildi" formu / geliştirme raporları.
export interface RoadmapItem {
  phase: string | null;
  text: string;
  done: boolean;
}

export interface DevReportInput {
  roadmap_source: "repo" | "approved" | null;
  roadmap_items: RoadmapItem[];
  missing_features: string[];
  extra_features: string[];
  notes: string[];
}

export interface DevReport extends DevReportInput {
  id: string;
  idea_id: string;
  round: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export function fetchDevReports(ideaId: string): Promise<{ reports: DevReport[] }> {
  return request(`/ideas/${ideaId}/dev-reports`);
}

// Fikri "Test bekliyor"a alır.
export function submitDevReport(ideaId: string, report: DevReportInput): Promise<{ report: DevReport }> {
  return request(`/ideas/${ideaId}/dev-report`, { method: "POST", body: JSON.stringify(report) });
}

// Faz 3 sonrası tur, Grup 4: test turları.
export type TestPlatform = "ios" | "android";
export type TestChannel = "testflight" | "play_internal" | "expo_go" | "direct_install" | "other";
export type ScenarioResult = "passed" | "partial" | "failed" | "skipped";
export type FindingSeverity = "critical" | "major" | "minor";
export type FindingKind = "bug" | "ux" | "feature_request" | "performance" | "other";
export type FindingPlatform = "ios" | "android" | "both";

export interface TestPlan {
  tester_count: number;
  duration_days: number;
  start_date: string;
  platforms: TestPlatform[];
  channel: TestChannel;
  scenarios: string[];
  success_criteria: string[];
}

export interface TestFinding {
  severity: FindingSeverity;
  kind: FindingKind;
  platform: FindingPlatform;
  text: string;
}

export interface TestResult {
  actual_tester_count: number;
  actual_days: number;
  scenario_results: { scenario: string; result: ScenarioResult }[];
  findings: TestFinding[];
  satisfaction: number | null;
}

export interface ReworkReason {
  summary: string;
  finding_indexes: number[];
}

export interface TestRound {
  id: string;
  idea_id: string;
  round: number;
  status: "running" | "approved" | "rework" | "cancelled";
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  plan: TestPlan;
  result: TestResult | null;
  rework_reason: ReworkReason | null;
  updated_by: string | null;
}

export function fetchTestRounds(ideaId: string): Promise<{ rounds: TestRound[] }> {
  return request(`/ideas/${ideaId}/test-rounds`);
}

// Fikri "Test ediliyor"a alır.
export function startTestRound(ideaId: string, plan: TestPlan): Promise<{ round: TestRound }> {
  return request(`/ideas/${ideaId}/test-rounds`, { method: "POST", body: JSON.stringify(plan) });
}

// Onay → "Dağıtıma hazır", geri gönderme → "Revizyonda".
export function submitTestResult(
  roundId: string,
  body: { result: TestResult; decision: "approved" | "rework"; rework_reason?: ReworkReason },
): Promise<{ round: TestRound }> {
  return request(`/test-rounds/${roundId}/result`, { method: "POST", body: JSON.stringify(body) });
}

// Turu iptal eder; fikir "Test bekliyor"a döner.
export function cancelTestRound(roundId: string): Promise<{ ok: true }> {
  return request(`/test-rounds/${roundId}/cancel`, { method: "POST" });
}

// Faz 3 sonrası tur, Grup 5: elle fikir girişi.
export type ManualIdeaInput =
  | {
      mode: "form";
      name: string;
      one_liner: string;
      problem: string;
      target_audience: string;
      core_features: string[];
      monetization: string;
      category: string;
      tags: string[];
    }
  | { mode: "describe"; name?: string; description: string };

// "describe" yolunda Claude işi hemen tetiklenir; tetiklenemezse
// dispatch_error dolu gelir (fikir yine de oluşturulmuştur).
export function createManualIdea(input: ManualIdeaInput): Promise<{ idea: Idea; dispatch_error: string | null }> {
  return request("/ideas/manual", { method: "POST", body: JSON.stringify(input) });
}

// Geliştirme aşamasındaki fikrin iskelet reposundaki son commit'i.
// Aynı fikir aynı anda birden çok rozette (tablo + mobil liste) görünebildiği
// için eşzamanlı istekler tek istekte birleştirilir; sonuç saklanmaz, ekran
// her açıldığında tazelenir.
const lastCommitInFlight = new Map<string, Promise<{ commit: RepoCommit | null }>>();

export function fetchLastCommit(ideaId: string): Promise<{ commit: RepoCommit | null }> {
  const pending = lastCommitInFlight.get(ideaId);
  if (pending) return pending;
  const promise = request<{ commit: RepoCommit | null }>(`/ideas/${ideaId}/last-commit`).finally(() =>
    lastCommitInFlight.delete(ideaId),
  );
  lastCommitInFlight.set(ideaId, promise);
  return promise;
}
