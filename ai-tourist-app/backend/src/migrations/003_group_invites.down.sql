-- 003_group_invites rollback
DROP INDEX IF EXISTS idx_group_invites_group;
DROP INDEX IF EXISTS idx_group_invites_code;
DROP TABLE IF EXISTS group_invites;