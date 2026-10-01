-- Faz 3 öncesi 2. tur, Grup 0: yeniden yazılan prompt'ların yeni çıktı alanları.
-- prompts/find-competitors.md her rakip için similarity (direct/partial/alternative)
-- döndürüyor; prompts/reevaluate-idea.md ise notun nasıl yorumlandığını
-- özetleyen bir change_summary. Eski satırlarda ikisi de NULL kalır.

ALTER TABLE idea_competitors ADD COLUMN similarity TEXT;

ALTER TABLE ideas ADD COLUMN last_reevaluation_summary TEXT;
