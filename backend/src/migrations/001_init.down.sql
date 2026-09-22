-- 001_init rollback. Drops everything created by 001_init.up.sql.
DROP TABLE IF EXISTS location_pings;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS voiceover_transcripts;
DROP INDEX IF EXISTS idx_spots_geom;
DROP TABLE IF EXISTS tourist_spots;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS users;
-- Leave postgis/uuid-ossp extensions installed (other DBs may use them).