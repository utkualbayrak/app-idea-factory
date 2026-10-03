-- Fikre yüklenen görseller (ekran tasarımı / ilham / varlık). Dosyanın kendisi
-- Workers KV'de (IMAGES binding, anahtar img:<id>); burada yalnızca metadata.
-- FK yok (0009 ile aynı gerekçe: ideas rebuild listesine girmesin). Purge ve
-- arşivlemede havuz bakımı temizler.
CREATE TABLE idea_images (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL,
  caption TEXT,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE INDEX idx_idea_images_idea ON idea_images (idea_id, position);

-- Görseller en son ne zaman değişti: planlama belgeleri bundan eskiyse arayüz
-- "belgeleri yeniden üret" uyarısı gösterir.
ALTER TABLE ideas ADD COLUMN images_changed_at TEXT;
