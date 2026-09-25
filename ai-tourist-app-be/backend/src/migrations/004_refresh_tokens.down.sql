-- Down: drop the refresh_tokens table. Cascading FK on users means
-- no separate user cleanup is required. Drop in the reverse order of
-- creation.
DROP INDEX IF EXISTS idx_refresh_tokens_user_active;
DROP INDEX IF EXISTS idx_refresh_tokens_user;
DROP TABLE IF EXISTS refresh_tokens;
