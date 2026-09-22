-- 001_init: Auth + TourGuide + GroupTracking tables + PostGIS extension.
-- Forward-only. See design.md §4 Data Model.

-- PostGIS extension (idempotent).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ── Auth context ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT,                       -- null if social-only
  display_name    TEXT,
  avatar_url      TEXT,
  fcm_token       TEXT,
  apns_token      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  ciphertext      BYTEA NOT NULL,             -- AES-256-GCM ciphertext blob
  iv              BYTEA NOT NULL,
  auth_tag        BYTEA NOT NULL,             -- GCM auth tag
  is_valid        BOOLEAN NOT NULL DEFAULT TRUE,
  validated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- ── TourGuide context ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tourist_spots (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  description       TEXT,
  geom              GEOGRAPHY(POINT, 4326) NOT NULL,
  geofence_radius_m INT NOT NULL DEFAULT 200,
  category          TEXT,
  metadata          JSONB,
  source            TEXT NOT NULL DEFAULT 'seed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spots_geom ON tourist_spots USING GIST (geom);

CREATE TABLE IF NOT EXISTS voiceover_transcripts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id         UUID NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
  transcript_text TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GroupTracking context ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT,
  geofence_threshold_km NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS location_pings (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL,
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  geom            GEOGRAPHY(POINT, 4326) NOT NULL,
  accuracy_m      REAL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_location_pings_geom ON location_pings USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_location_pings_group_ts ON location_pings (group_id, timestamp DESC);