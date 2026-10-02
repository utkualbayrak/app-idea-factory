-- Faz 3 sonrası tur, Grup 5: elle fikir girişi.
--
-- origin: 'cron' (günlük üretim) ya da 'manual' (kullanıcı girdi).
-- source_text: kullanıcının serbest açıklaması ("açıklama yaz, Claude
-- doldursun" yolu). Doluysa ve fikir henüz puanlanmamışsa evaluate-idea.yml
-- açıklamadan tüm alanları doldurur; formla girilen fikirde NULL kalır ve
-- Claude yalnızca puanlar.
--
-- Puanlanmamış fikirde scores sütunu JSON 'null' tutar (sütun NOT NULL ve
-- bunu değiştirmek ideas'ı yeniden kurmayı gerektirirdi). API bunu null
-- olarak döndürür.

ALTER TABLE ideas ADD COLUMN origin TEXT NOT NULL DEFAULT 'cron';
ALTER TABLE ideas ADD COLUMN source_text TEXT;
