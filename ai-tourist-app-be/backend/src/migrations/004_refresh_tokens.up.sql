-- 004_refresh_tokens: Rotation + revocation store.
-- Forward-only. See design.md §8.4 + task T1.3 for rotation requirements.
--
-- Lifecycle:
--   1. signup / login / refresh  -> INSERT a row with a new jti
--   2. refresh  (rotation)      -> old row UPDATE revoked_at = now(), replaced_by_jti = new jti
--                                   in the SAME transaction, then INSERT a new row.
--   3. logout                   -> UPDATE revoked_at = now() for that jti.
--   4. /auth/refresh guard      -> SELECT ... WHERE jti = $1 AND revoked_at IS NULL
--                                   AND expires_at > now(); absence -> reject.
--
-- Detecting refresh-token REPLAY (stolen refresh used twice): if a refresh hits
-- a row whose revoked_at IS NOT NULL, the entire chain for that user is revoked
-- (rotate-and-revoke on suspicion of theft). This is enforced in the service
-- layer, not in SQL.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti              UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  -- When a refresh is rotated, the new jti is recorded here. NULL until revoked.
  replaced_by_jti  UUID
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
  ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
