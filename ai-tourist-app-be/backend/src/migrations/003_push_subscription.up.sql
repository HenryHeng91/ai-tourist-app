-- 003_push_subscription: align users with design.md §4 ("push_subscription TEXT"
-- stores the Web Push subscription JSON for the user's browser, since Web Push
-- is the only push channel for a React web app — FCM/APNs tokens apply to
-- native apps, which are out of scope per requirement §6).
--
-- The old fcm_token / apns_token columns were placeholders from Sprint 1; they
-- are dropped here. Data migration: if any rows had a token, it would have
-- been an experimental value (no production deployment yet), so the loss is
-- acceptable. Idempotent so re-running is safe.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_subscription TEXT;

ALTER TABLE users
  DROP COLUMN IF EXISTS apns_token;

ALTER TABLE users
  DROP COLUMN IF EXISTS fcm_token;
