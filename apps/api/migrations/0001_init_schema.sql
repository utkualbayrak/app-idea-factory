-- docs/PROJE.md "Veri modeli (D1, taslak)" bölümüne karşılık gelir.

CREATE TABLE ideas (
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
  inspiration_source TEXT NOT NULL,
  scores TEXT NOT NULL,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  user_note TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'archived', 'in_development', 'developed'))
);

CREATE INDEX idx_ideas_batch_date ON ideas(batch_date);
CREATE INDEX idx_ideas_status ON ideas(status);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  params TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  repo_url TEXT,
  issue_url TEXT,
  project_item_id TEXT,
  workflow_run_id TEXT,
  error TEXT
);

CREATE INDEX idx_tasks_idea_id ON tasks(idea_id);

CREATE TABLE trend_snapshots (
  id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL,
  payload TEXT NOT NULL
);
