-- 003_group_invites: Single-use invite tokens with 24h expiry.
CREATE TABLE IF NOT EXISTS group_invites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invite_code     TEXT UNIQUE NOT NULL,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_invites_code ON group_invites (invite_code);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites (group_id);