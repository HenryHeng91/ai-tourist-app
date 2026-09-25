-- 002_poi_columns: Add POI enrichment columns to tourist_spots for
-- Google Places / Wikidata integration (Sprint 2, Issue #6).
-- Idempotent so re-running is safe.

ALTER TABLE tourist_spots
  ADD COLUMN IF NOT EXISTS place_id            TEXT,       -- Google Places place_id
  ADD COLUMN IF NOT EXISTS rating              NUMERIC(2,1), -- 0.0–5.0
  ADD COLUMN IF NOT EXISTS user_ratings_total  INT,
  ADD COLUMN IF NOT EXISTS categories          TEXT[],      -- full type list from POI
  ADD COLUMN IF NOT EXISTS synced_at           TIMESTAMPTZ, -- last POI refresh
  ADD COLUMN IF NOT EXISTS wikidata_id         TEXT;        -- Wikidata Q-ID (fallback source)

-- One spot per Google Places place_id (where set). Multiple NULLs are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_spots_place_id
  ON tourist_spots (place_id) WHERE place_id IS NOT NULL;

-- One spot per Wikidata Q-ID (where set).
CREATE UNIQUE INDEX IF NOT EXISTS uq_spots_wikidata_id
  ON tourist_spots (wikidata_id) WHERE wikidata_id IS NOT NULL;

-- Category filter index for typed queries.
CREATE INDEX IF NOT EXISTS idx_spots_category ON tourist_spots (category);