-- Faz 3 sonrası, 4. not turu Grup B (kanban): her fikrin son durum değişim zamanı.
--
-- Durumu değiştiren yol çok (PATCH, görev uçları, geliştirme raporu, test
-- turları, workflow kancaları); hepsine ayrı ayrı damga eklemek yerine bir
-- trigger status her değiştiğinde ISO zaman damgası yazar. Bir gün ideas
-- yeniden kurulursa (bkz. 0007/0008) bu trigger da yeniden oluşturulmalı.

ALTER TABLE ideas ADD COLUMN status_changed_at TEXT;

-- Geçmiş için en iyi tahmin: son aktivite bir durum değişikliğiyse onun
-- zamanı, değilse fikrin oluşturulma zamanı.
UPDATE ideas SET status_changed_at = CASE
  WHEN last_activity_kind = 'status_changed' AND last_activity_at IS NOT NULL THEN last_activity_at
  ELSE created_at
END;

CREATE TRIGGER ideas_status_changed_at
AFTER UPDATE OF status ON ideas
FOR EACH ROW WHEN OLD.status IS NOT NEW.status
BEGIN
  UPDATE ideas SET status_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
