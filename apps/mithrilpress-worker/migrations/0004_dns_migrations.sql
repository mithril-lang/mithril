PRAGMA foreign_keys = ON;

-- Owner-driven DNS migration planning. Zone snapshots can contain sensitive TXT
-- values, so they are site-scoped, access-controlled, and explicitly erasable.
CREATE TABLE dns_migrations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'ownership_pending', 'source_pending', 'source_loaded', 'target_loaded',
    'owner_approved', 'delegation_verified', 'rolled_back', 'cancelled', 'archived'
  )),
  owner_token_id TEXT NOT NULL,
  ownership_txt_name TEXT,
  ownership_txt_value TEXT,
  ownership_expires_at TEXT,
  ownership_verified_at TEXT,
  source_nameservers_json TEXT NOT NULL,
  source_ds_json TEXT NOT NULL,
  source_dns_state_captured_at TEXT,
  source_zone_text TEXT,
  source_zone_sha256 TEXT,
  source_record_count INTEGER CHECK (source_record_count IS NULL OR source_record_count BETWEEN 1 AND 2000),
  source_apex_soa_present INTEGER CHECK (source_apex_soa_present IS NULL OR source_apex_soa_present IN (0, 1)),
  source_apex_ns_count INTEGER CHECK (source_apex_ns_count IS NULL OR source_apex_ns_count BETWEEN 0 AND 2000),
  target_zone_text TEXT,
  target_zone_sha256 TEXT,
  target_record_count INTEGER CHECK (target_record_count IS NULL OR target_record_count BETWEEN 1 AND 2000),
  target_nameservers_json TEXT,
  diff_json TEXT,
  import_zone_text TEXT,
  approval_digest TEXT,
  owner_approved_at TEXT,
  delegation_check_json TEXT,
  rollback_check_json TEXT,
  delegation_verified_at TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (site_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, owner_token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE UNIQUE INDEX dns_migrations_active_zone ON dns_migrations(zone_name)
WHERE status IN ('source_pending', 'source_loaded', 'target_loaded', 'owner_approved', 'delegation_verified');
CREATE INDEX dns_migrations_by_site_status ON dns_migrations(site_id, status, updated_at);

CREATE TRIGGER dns_migrations_active_limit_insert
BEFORE INSERT ON dns_migrations
WHEN NEW.status IN ('ownership_pending', 'source_pending', 'source_loaded', 'target_loaded', 'owner_approved', 'delegation_verified')
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM dns_migrations
    WHERE site_id = NEW.site_id
      AND status IN ('ownership_pending', 'source_pending', 'source_loaded', 'target_loaded', 'owner_approved', 'delegation_verified')
  ) >= 3 THEN RAISE(ABORT, 'dns_migration_active_limit') END;
END;

CREATE TABLE dns_migration_actions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'ownership-check', 'ownership-verified', 'source-uploaded', 'target-uploaded',
    'diff-approved', 'delegation-check-started', 'delegation-check',
    'rollback-check-started', 'rollback-check', 'cancelled', 'snapshots-erased'
  )),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id, migration_id) REFERENCES dns_migrations(site_id, id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

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
