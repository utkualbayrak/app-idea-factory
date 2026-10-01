-- Faz 3, Grup 3A: "Geliştir" akışı. Fikir önce görev formu + Claude'un
-- ürettiği planlama belgeleriyle 'awaiting_development' durumuna geçer;
-- kullanıcı belgeleri onaylayıp "Geliştirmeye başla" deyince
-- 'in_development' olur (iskelet üretimi, Grup 3C).
--
-- 1) ideas.status CHECK'ine 'awaiting_development' ekleniyor. SQLite CHECK'i
--    ALTER ile değiştiremediği için tablo yeniden kuruluyor (0002'deki gibi).
--    Ancak artık workflow_runs / idea_competitors ideas(id)'ye foreign key ile
--    bağlı ve D1'de FK denetimi açık: ideas'ı DROP etmek bu satırlar yüzünden
--    patlar. `PRAGMA defer_foreign_keys` YETMİYOR — SQLite ertelenmiş ihlalleri
--    sayaçla tutuyor, DROP'ta artan sayaç satırlar RENAME edilen tabloda geri
--    gelince azalmıyor ve commit yine patlıyor (yerelde sqlite3 ile denendi).
--    Bu yüzden bağlı tablolar önce yedeklenip siliniyor, ideas yeniden
--    kurulduktan sonra aynı şemayla geri yükleniyor.

CREATE TABLE workflow_runs_bak AS SELECT * FROM workflow_runs;
-- Rakipler ekranda rowid sırasıyla (direct → partial → alternative) dönüyor;
-- geri yüklerken aynı sıra korunsun diye yedek de rowid sırasıyla alınıyor.
CREATE TABLE idea_competitors_bak AS SELECT * FROM idea_competitors ORDER BY rowid;

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
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'on_hold', 'deleted', 'awaiting_development', 'in_development', 'developed')),
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
  user_rating, user_note, user_note_updated_at, last_reevaluated_at, status,
  last_reevaluation_summary, last_activity_at, last_activity_kind, activity_seen_at
FROM ideas;

DROP TABLE ideas;
ALTER TABLE ideas_new RENAME TO ideas;

CREATE INDEX idx_ideas_batch_date ON ideas(batch_date);
CREATE INDEX idx_ideas_status ON ideas(status);

-- Bağlı tablolar 0004/0005/0006'daki şemalarıyla aynen geri kuruluyor.
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

DROP TABLE workflow_runs_bak;
DROP TABLE idea_competitors_bak;

-- 2) tasks 0001'den beri hiç kullanılmadı (boş) — yeni durum akışıyla
--    yeniden kuruluyor. Fikir başına tek görev (idea_id UNIQUE); belgeleri
--    yeniden üretmek ve "tekrar dene" aynı satırı günceller.
--    planning → ready (belgeler hazır, kullanıcı onayı bekliyor) → queued →
--    running → done / failed. planning_failed: belge üretimi başarısız.

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

-- 3) Claude'un ürettiği, kullanıcının arayüzde düzenleyebildiği planlama
--    belgeleri (Markdown, Türkçe). İskelet üretiminde repoya docs/ altına
--    kopyalanır. user_edited_at: kullanıcı en son ne zaman elle düzenledi.

CREATE TABLE task_documents (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL CHECK (kind IN ('prd', 'screens', 'tech_plan', 'roadmap')),
  content TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  user_edited_at TEXT,
  PRIMARY KEY (task_id, kind)
);
