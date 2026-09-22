-- 002_poi_columns rollback.
DROP INDEX IF EXISTS idx_spots_category;
DROP INDEX IF EXISTS uq_spots_wikidata_id;
DROP INDEX IF EXISTS uq_spots_place_id;
ALTER TABLE tourist_spots
  DROP COLUMN IF EXISTS wikidata_id,
  DROP COLUMN IF EXISTS synced_at,
  DROP COLUMN IF EXISTS categories,
  DROP COLUMN IF EXISTS user_ratings_total,
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS place_id;