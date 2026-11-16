PRAGMA foreign_keys = ON;

ALTER TABLE dns_migrations
  ADD COLUMN target_provider TEXT
  CHECK (target_provider IS NULL OR target_provider = 'cloudflare');

ALTER TABLE dns_migrations
  ADD COLUMN target_provider_zone_id TEXT
  CHECK (
    target_provider_zone_id IS NULL
    OR (length(target_provider_zone_id) = 32
        AND target_provider_zone_id NOT GLOB '*[^0-9a-f]*')
  );

DROP TRIGGER dns_migration_actions_no_update;
DROP TRIGGER dns_migration_actions_no_delete;
DROP INDEX dns_migration_actions_by_migration_time;
ALTER TABLE dns_migration_actions RENAME TO dns_migration_actions_previous;

CREATE TABLE dns_migration_actions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'ownership-check', 'ownership-verified', 'source-uploaded', 'target-uploaded',
    'diff-approved', 'delegation-check-started', 'delegation-check',
    'rollback-check-started', 'rollback-check', 'cancelled', 'snapshots-erased',
    'cloudflare-zone-read', 'cloudflare-import-started',
    'cloudflare-import-finished', 'cloudflare-import-failed'
  )),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id, migration_id) REFERENCES dns_migrations(site_id, id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

INSERT INTO dns_migration_actions (
  id, site_id, migration_id, token_id, action, created_at, metadata_json
)
SELECT id, site_id, migration_id, token_id, action, created_at, metadata_json
FROM dns_migration_actions_previous;

DROP TABLE dns_migration_actions_previous;

CREATE INDEX dns_migration_actions_by_migration_time
  ON dns_migration_actions(site_id, migration_id, created_at);

CREATE TRIGGER dns_migration_actions_no_update
BEFORE UPDATE ON dns_migration_actions
BEGIN
  SELECT RAISE(ABORT, 'dns_migration_audit_is_append_only');
END;

CREATE TRIGGER dns_migration_actions_no_delete
BEFORE DELETE ON dns_migration_actions
BEGIN
  SELECT RAISE(ABORT, 'dns_migration_audit_is_append_only');
END;
