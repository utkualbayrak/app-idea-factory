-- Faz 3 sonrası tur, Grup 3: "Geliştirildi" formu.
--
-- Her gönderim bir geliştirme raporu: yol haritasındaki görevlerden
-- hangilerinin bittiği, eksik kalan ve fazladan eklenen özellikler, kısa
-- notlar. Tur numarası (round) test turlarıyla eşleşir: testten geri
-- gönderilen (rework) fikir tekrar "Geliştirildi" denince yeni tur açılır.
--
-- FK yok (repo_files/repo_syncs ile aynı gerekçe): ideas bir gün yeniden
-- kurulursa bu tabloyu da yedekleyip geri yüklemek gerekmesin. Fikirler hiç
-- fiziksel olarak silinmediği için yetim satır oluşmuyor.

CREATE TABLE dev_reports (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Yol haritası listesinin nereden geldiği: 'repo' (senkronlanmış
  -- docs/roadmap.md) ya da 'approved' (onaylı planlama belgesi).
  roadmap_source TEXT,
  -- JSON: [{ phase, text, done }]
  roadmap_items TEXT NOT NULL,
  -- JSON: string[]
  missing_features TEXT NOT NULL,
  extra_features TEXT NOT NULL,
  notes TEXT NOT NULL,
  UNIQUE (idea_id, round)
);
