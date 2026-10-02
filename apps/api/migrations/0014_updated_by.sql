-- Cloudflare Access artık birden fazla e-postaya açık: kayıtlarda "en son kim
-- güncelledi" tutulur. Yalnızca son değiştiren (geçmiş yok). Değer Access
-- JWT'sindeki e-posta (apps/api/src/identity.ts), workflow yazımları için
-- 'system'. Eski satırlar NULL kalır — kimin yaptığı bilinmiyor.
--
-- Hepsi ADD COLUMN: ideas yeniden kurulmuyor, FK çocukları ve
-- ideas_status_changed_at trigger'ı etkilenmez.

-- ideas.updated_at/updated_by yalnızca kullanıcı değişikliklerinde yazılır
-- (Claude'un sonuçları aktivite rozetinde, last_activity_by = 'system').
ALTER TABLE ideas ADD COLUMN updated_at TEXT;
ALTER TABLE ideas ADD COLUMN updated_by TEXT;
ALTER TABLE ideas ADD COLUMN last_activity_by TEXT;

-- tasks.updated_at'i workflow kancaları da yazıyor; updated_by onunla tutarlı
-- kalır ('system' dahil).
ALTER TABLE tasks ADD COLUMN updated_by TEXT;
-- user_edited_at ile eşleşir.
ALTER TABLE task_documents ADD COLUMN edited_by TEXT;
ALTER TABLE dev_reports ADD COLUMN updated_by TEXT;
ALTER TABLE test_rounds ADD COLUMN updated_by TEXT;
ALTER TABLE app_settings ADD COLUMN updated_by TEXT;
ALTER TABLE repo_syncs ADD COLUMN synced_by TEXT;

-- Ayarlar > Kullanıcılar: e-posta → görünen ad. Eşlemesi olmayan e-posta
-- arayüzde @ öncesiyle gösterilir.
CREATE TABLE user_names (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
