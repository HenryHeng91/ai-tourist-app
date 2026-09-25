-- 003_push_subscription rollback. Restores the original two-column layout.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apns_token TEXT;

ALTER TABLE users
  DROP COLUMN IF EXISTS push_subscription;
