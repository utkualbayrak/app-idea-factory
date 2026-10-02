-- Faz 3 sonrası tur, Grup 1: geliştirme → test → dağıtıma hazır akışı.
--
-- Yeni durumlar: awaiting_test (Test bekliyor), testing (Test ediliyor),
-- approved (Onaylandı / dağıtıma hazır), rework (Revizyonda, testten döndü).
-- Eski 'developed' kaldırıldı, kayıtları 'awaiting_test'e taşınıyor.
--
-- ideas.status üzerindeki CHECK bu sefer tamamen kaldırılıyor: geçerli
-- durumlar ve izinli geçişler artık API'de (apps/api/src/schema.ts
-- IDEA_STATUSES + app.ts geçiş tablosu) tek yerde. Böylece bir sonraki yeni
-- durum için bu yeniden kurulum dansı gerekmeyecek.
--
-- Yeniden kurulum 0007'deki gerekçeyle aynı yolu izliyor (PRAGMA
-- defer_foreign_keys işe yaramıyor): ideas'a bağlı her tablo yedeklenip
-- siliniyor, ideas kuruluyor, bağlılar aynı şemayla geri yükleniyor. 0007'den
-- farkı: tasks artık dolu, task_documents de tasks'a bağlı — ikisi de dahil.

CREATE TABLE workflow_runs_bak AS SELECT * FROM workflow_runs;
CREATE TABLE idea_competitors_bak AS SELECT * FROM idea_competitors ORDER BY rowid;
CREATE TABLE tasks_bak AS SELECT * FROM tasks;
CREATE TABLE task_documents_bak AS SELECT * FROM task_documents;

-- Önce en alttaki çocuk (task_documents → tasks → ideas).
DROP TABLE task_documents;
DROP TABLE tasks;
DROP TABLE workflow_runs;
DROP TABLE idea_competitors;

CREATE TABLE ideas_new (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  batch_date TEXT NOT NULL,
  name TEXT NOT NULL,
  one_liner TEXT NOT NULL,
  problem TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  core_features TEXT NOT NULL,
  monetization TEXT NOT NULL,
  category TEXT NOT NULL,
  inspiration_sources TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  scores TEXT NOT NULL,
  user_rating REAL CHECK (user_rating BETWEEN 0 AND 10),
  user_note TEXT,
  user_note_updated_at TEXT,
  last_reevaluated_at TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  last_reevaluation_summary TEXT,
  last_activity_at TEXT,
  last_activity_kind TEXT,
  activity_seen_at TEXT
);

INSERT INTO ideas_new (
  id, created_at, batch_date, name, one_liner, problem, target_audience,
  core_features, monetization, category, inspiration_sources, tags, scores,
  user_rating, user_note, user_note_updated_at, last_reevaluated_at, status,
  last_reevaluation_summary, last_activity_at, last_activity_kind, activity_seen_at
)
SELECT
  id, created_at, batch_date, name, one_liner, problem, target_audience,
  core_features, monetization, category, inspiration_sources, tags, scores,
  user_rating, user_note, user_note_updated_at, last_reevaluated_at,
  CASE status WHEN 'developed' THEN 'awaiting_test' ELSE status END,
  last_reevaluation_summary, last_activity_at, last_activity_kind, activity_seen_at
FROM ideas;

DROP TABLE ideas;
ALTER TABLE ideas_new RENAME TO ideas;

CREATE INDEX idx_ideas_batch_date ON ideas(batch_date);
CREATE INDEX idx_ideas_status ON ideas(status);

-- Bağlı tablolar 0007'deki şemalarıyla aynen geri kuruluyor.
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  run_url TEXT,
  error TEXT
);

CREATE INDEX idx_workflow_runs_created_at ON workflow_runs(created_at);
CREATE INDEX idx_workflow_runs_idea_id ON workflow_runs(idea_id);

INSERT INTO workflow_runs (id, workflow, idea_id, status, created_at, started_at, finished_at, run_url, error)
SELECT id, workflow, idea_id, status, created_at, started_at, finished_at, run_url, error FROM workflow_runs_bak;

CREATE TABLE idea_competitors (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  app_name TEXT NOT NULL,
  url TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  similarity TEXT
);

CREATE INDEX idx_idea_competitors_idea_id ON idea_competitors(idea_id);

INSERT INTO idea_competitors (id, idea_id, app_name, url, note, created_at, similarity)
SELECT id, idea_id, app_name, url, note, created_at, similarity FROM idea_competitors_bak ORDER BY rowid;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL UNIQUE REFERENCES ideas(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planning', 'planning_failed', 'ready', 'queued', 'running', 'done', 'failed')),
  repo_url TEXT,
  issue_url TEXT,
  project_item_id TEXT,
  workflow_run_id TEXT,
  error TEXT
);

INSERT INTO tasks (id, idea_id, created_at, updated_at, params, status, repo_url, issue_url, project_item_id, workflow_run_id, error)
SELECT id, idea_id, created_at, updated_at, params, status, repo_url, issue_url, project_item_id, workflow_run_id, error FROM tasks_bak;

CREATE TABLE task_documents (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL CHECK (kind IN ('prd', 'screens', 'tech_plan', 'roadmap')),
  content TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  user_edited_at TEXT,
  PRIMARY KEY (task_id, kind)
);

INSERT INTO task_documents (task_id, kind, content, generated_at, user_edited_at)
SELECT task_id, kind, content, generated_at, user_edited_at FROM task_documents_bak;

DROP TABLE workflow_runs_bak;
DROP TABLE idea_competitors_bak;
DROP TABLE tasks_bak;
DROP TABLE task_documents_bak;
