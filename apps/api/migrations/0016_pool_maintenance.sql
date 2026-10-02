-- Havuz bakımı (2026-10-02/03): 3 günde bir çalışan merge-ideas.yml
-- Fikirler listesindeki yakın fikirleri birleştirir, geliştirmedeki fikirlere
-- özellik önerir; puanı art arda düşük kalan fikirleri arşivler ve süresi
-- dolan arşivlenmiş/silinmiş fikirleri kalıcı siler.
-- Yalnızca ADD COLUMN ve yeni tablolar: ideas rebuild yok.

-- Yeni durumlar (CHECK yok, bkz. 0008): 'merged' (başka bir fikre
-- birleştirildi ya da geliştirmedeki bir fikre özellik önerisi olarak
-- aktarıldı) ve 'archived' (gözden düştü, yalnızca özeti kaldı).
-- merged_into_id: birleşik fikir ya da önerinin hedeflediği fikir.
ALTER TABLE ideas ADD COLUMN merged_into_id TEXT;
-- Art arda kaç bakım koşusunda bakım puanı 7.00'ın altında kaldı.
ALTER TABLE ideas ADD COLUMN stale_runs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ideas ADD COLUMN archived_at TEXT;
-- Kalıcı silme süresinin başlangıcı. Eski silinmiş fikirlerde null; onlar
-- için status_changed_at (o da yoksa created_at) kullanılır.
ALTER TABLE ideas ADD COLUMN deleted_at TEXT;

-- Bakım koşuları da cron_runs'ta tutulur (Çalışma geçmişi altyapısı aynen).
ALTER TABLE cron_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'daily';
-- Bakım koşusunun özeti: {merged, features, archived, purged, ...}.
ALTER TABLE cron_runs ADD COLUMN summary TEXT;

-- Claude'un birleştirme ve özellik önerileri. FK yok (0009 gerekçesi).
CREATE TABLE pool_proposals (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  kind TEXT NOT NULL,                -- 'merge' | 'feature'
  status TEXT NOT NULL,              -- 'pending' | 'applied' | 'rejected' | 'undone'
  auto_applied INTEGER NOT NULL DEFAULT 0,
  source_ids TEXT NOT NULL,          -- JSON dizi
  source_prev_statuses TEXT,         -- JSON {id: status}, geri alma için
  target_idea_id TEXT,               -- feature: geliştirmedeki fikir; merge: uygulanınca oluşan fikir
  payload TEXT NOT NULL,             -- JSON; merge: yeni fikir, feature: {title, description}
  reason TEXT NOT NULL,
  error TEXT,                        -- otomatik uygulanamadıysa sebebi
  issue_url TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);

CREATE INDEX idx_pool_proposals_status ON pool_proposals(status);
CREATE INDEX idx_pool_proposals_target ON pool_proposals(target_idea_id);

-- Kalıcı silinen fikirlerin normalize edilmiş adları: isim tekrarı kontrolü
-- satır silindikten sonra da çalışsın.
CREATE TABLE retired_names (
  name TEXT PRIMARY KEY,
  retired_at TEXT NOT NULL
);
