-- Grup 4 (notes.txt madde 1/2/5/13): yeniden değerlendirme + rakip bulma
-- arka plan işleri ve trend_snapshots'ın gerçekten kullanılmaya başlanması.

CREATE TABLE idea_competitors (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  app_name TEXT NOT NULL,
  url TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_idea_competitors_idea_id ON idea_competitors(idea_id);

-- trend_snapshots Faz 1'den beri var ama hiç yazılmıyordu. cron_run_id,
-- Cron Geçmişi ekranından o çalışmanın kaynak detaylarına (hangi öğeler
-- toplandı) gidebilmek için.
ALTER TABLE trend_snapshots ADD COLUMN cron_run_id TEXT;

CREATE INDEX idx_trend_snapshots_cron_run_id ON trend_snapshots(cron_run_id);
CREATE INDEX idx_trend_snapshots_source_fetched_at ON trend_snapshots(source, fetched_at);
