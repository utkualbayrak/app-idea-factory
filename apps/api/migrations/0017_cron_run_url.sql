-- Günlük üretim ve havuz bakımı koşularının GitHub Actions log adresi:
-- ekran çalışan bir işin loguna doğrudan bağlansın. Kayıt artık tetikleme
-- anında açılıyor (bkz. /admin/trigger-workflow), adres iş başlayınca yazılır.
ALTER TABLE cron_runs ADD COLUMN run_url TEXT;
