-- Faz 3 sonrası tur, Grup 4: test süreci.
--
-- "Testi başlat" bir test turu açar (plan: kişi/gün sayısı, başlangıç,
-- platformlar, dağıtım kanalı, senaryolar, başarı kriterleri) ve fikri
-- 'testing' yapar. Tur sonuç formuyla kapanır: onay → fikir 'approved',
-- geri gönderme → 'rework' (sebep zorunlu). İptal → tur 'cancelled', fikir
-- 'awaiting_test'. round, test edilen geliştirme raporunun turu; iptal edilip
-- yeniden başlatılan aynı tur için birden fazla satır olabilir (UNIQUE yok).
--
-- FK yok (0009/0010 ile aynı gerekçe).

CREATE TABLE test_rounds (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  status TEXT NOT NULL,           -- running / approved / rework / cancelled
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  plan TEXT NOT NULL,             -- JSON, bkz. testPlanSchema
  result TEXT,                    -- JSON, bkz. testResultSchema (kapanınca)
  rework_reason TEXT              -- JSON { summary, finding_indexes } (rework'te)
);

CREATE INDEX idx_test_rounds_idea_id ON test_rounds(idea_id, created_at);
