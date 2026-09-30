-- Grup 1 (notes.txt geri bildirimi, 2026-09-30): puanlama sistemi 1-5/1-10
-- tam sayidan 0.00-10.00 (0.25 adim) ondalikliya geciyor, status'e
-- on_hold/deleted ekleniyor (archived kalkiyor), tags ve coklu ilham
-- kaynagi ekleniyor, not/yeniden-degerlendirme zaman damgalari ekleniyor.
--
-- SQLite'ta CHECK/tip degisikligi ALTER TABLE ile yapilamadigi icin tablo
-- yeniden olusturulup veri donusturerek kopyalaniyor.

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
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'on_hold', 'deleted', 'in_development', 'developed'))
);

INSERT INTO ideas_new (
  id, created_at, batch_date, name, one_liner, problem, target_audience,
  core_features, monetization, category, inspiration_sources, tags, scores,
  user_rating, user_note, status
)
SELECT
  id, created_at, batch_date, name, one_liner, problem, target_audience,
  core_features, monetization, category,
  json_array(inspiration_source),
  '[]',
  scores,
  user_rating * 2, -- eski 1-5 olcek -> yeni 0-10 olcek
  user_note,
  CASE status WHEN 'archived' THEN 'on_hold' ELSE status END
FROM ideas;

DROP TABLE ideas;
ALTER TABLE ideas_new RENAME TO ideas;

CREATE INDEX idx_ideas_batch_date ON ideas(batch_date);
CREATE INDEX idx_ideas_status ON ideas(status);
