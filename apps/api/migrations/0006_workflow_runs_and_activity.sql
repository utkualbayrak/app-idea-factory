-- Faz 3 öncesi 2. tur, Grup C: fikir bazlı arka plan işlerinin (yeniden
-- değerlendirme, rakip bulma) geçmişi + fikir listesinde "ne olup bitti"
-- rozeti için son aktivite alanları. Zamanlar ISO (Z'li) yazılır.

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

ALTER TABLE ideas ADD COLUMN last_activity_at TEXT;
ALTER TABLE ideas ADD COLUMN last_activity_kind TEXT;
ALTER TABLE ideas ADD COLUMN activity_seen_at TEXT;

-- Mevcut fikirler için geriye dönük doldurma: en son not/yeniden
-- değerlendirme zamanı son aktivite olur; "görüldü" de aynı an sayılır ki
-- eski olaylar okunmamış görünmesin.
UPDATE ideas
SET last_activity_at = last_reevaluated_at,
    last_activity_kind = 'reevaluated',
    activity_seen_at = last_reevaluated_at
WHERE last_reevaluated_at IS NOT NULL
  AND (user_note_updated_at IS NULL OR last_reevaluated_at >= user_note_updated_at);

UPDATE ideas
SET last_activity_at = user_note_updated_at,
    last_activity_kind = 'note_updated',
    activity_seen_at = user_note_updated_at
WHERE last_activity_at IS NULL AND user_note_updated_at IS NOT NULL;
