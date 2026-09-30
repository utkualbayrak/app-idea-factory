-- Grup 3 (notes.txt madde 11/13, madde 10): ayarlar ekranı (kaynak
-- aç/kapat + manuel cron tetikleme) ve cron geçmişi ekranı için tablolar.

-- key-value ayarlar; bir key hiç yoksa varsayılan "etkin" kabul edilir
-- (bkz. apps/api/src/app.ts) — bu yüzden seed satırı gerekmiyor.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cron_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  source_breakdown TEXT,
  error TEXT
);

CREATE INDEX idx_cron_runs_started_at ON cron_runs(started_at);
