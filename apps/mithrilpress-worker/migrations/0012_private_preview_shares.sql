PRAGMA foreign_keys = ON;

CREATE TABLE private_preview_shares (
  site_id TEXT NOT NULL,
  share_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  token_hash_hex TEXT NOT NULL CHECK (length(token_hash_hex) = 64),
  created_by_token_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  exchanged_at TEXT,
  exchange_id TEXT UNIQUE,
  revoked_at TEXT,
  revocation_id TEXT UNIQUE,
  PRIMARY KEY (site_id, share_id),
  UNIQUE (site_id, token_hash_hex),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id),
  FOREIGN KEY (site_id, created_by_token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE INDEX private_preview_shares_by_revision
  ON private_preview_shares(site_id, revision_id, created_at);
CREATE INDEX private_preview_shares_by_expiry
  ON private_preview_shares(site_id, expires_at);

CREATE TABLE private_preview_share_sessions (
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  share_id TEXT NOT NULL,
  salt_hex TEXT NOT NULL CHECK (length(salt_hex) = 32),
  secret_hash_hex TEXT NOT NULL CHECK (length(secret_hash_hex) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (site_id, session_id),
  FOREIGN KEY (site_id, share_id) REFERENCES private_preview_shares(site_id, share_id)
);

CREATE INDEX private_preview_share_sessions_by_expiry
  ON private_preview_share_sessions(site_id, expires_at);

CREATE TABLE private_preview_share_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  share_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'exchanged', 'revoked')),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id, share_id) REFERENCES private_preview_shares(site_id, share_id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE INDEX private_preview_share_events_by_site_time
  ON private_preview_share_events(site_id, created_at);
