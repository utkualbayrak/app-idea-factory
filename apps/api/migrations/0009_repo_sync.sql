-- Faz 3 sonrası tur, Grup 2: iskelet reposuyla senkron.
--
-- "Repoyla senkronla" butonu Worker'dan GitHub API'ye gider: son commit'ler
-- ve repodaki *.md dosyaları çekilir. Yalnızca blob sha'sı değişen dosyalar
-- indirilir; önceki içerik previous_content'te kalır (ekrandaki diff için).
--
-- Bilerek FOREIGN KEY yok: bu iki tablo repodan her an yeniden üretilebilen
-- bir önbellek. tasks'a FK olsaydı bir sonraki ideas/tasks yeniden kurulumunda
-- bunları da yedekleyip geri yüklemek gerekirdi (bkz. 0007/0008).

CREATE TABLE repo_files (
  task_id TEXT NOT NULL,
  path TEXT NOT NULL,
  blob_sha TEXT NOT NULL,
  size INTEGER NOT NULL,
  -- NULL: dosya çekilemeyecek kadar büyük.
  content TEXT,
  previous_content TEXT,
  first_seen_at TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (task_id, path)
);

CREATE TABLE repo_syncs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  head_sha TEXT,
  previous_head_sha TEXT,
  -- JSON: [{ sha, message, author, date, url }], en yeniden eskiye.
  commits TEXT NOT NULL,
  -- JSON: [{ path, change: 'added' | 'modified' | 'removed' }]
  changes TEXT NOT NULL,
  -- Değişmiş ama bu senkronda alt istek sınırı yüzünden çekilemeyen dosya
  -- sayısı; bir sonraki senkron kaldığı yerden devam eder.
  pending_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_repo_syncs_task_id ON repo_syncs(task_id, synced_at);
