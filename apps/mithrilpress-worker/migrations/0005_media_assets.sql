PRAGMA foreign_keys = ON;

-- Images are owner-provided and stored under random tenant-scoped R2 keys.
CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  wordpress_source_id INTEGER CHECK (wordpress_source_id IS NULL OR wordpress_source_id > 0),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
  byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 8388608),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 8192),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 8192),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  alt_text TEXT NOT NULL DEFAULT '' CHECK (length(alt_text) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'deleting')),
  uploaded_by_token_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (site_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, uploaded_by_token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE UNIQUE INDEX media_assets_by_wordpress_source
  ON media_assets(site_id, wordpress_source_id)
  WHERE wordpress_source_id IS NOT NULL;
CREATE INDEX media_assets_by_site_status ON media_assets(site_id, status, id);

CREATE TABLE mithrilpress_site_media_usage (
  site_id TEXT PRIMARY KEY,
  asset_bytes INTEGER NOT NULL DEFAULT 0 CHECK (asset_bytes >= 0),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE mithrilpress_deployment_media_usage (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  asset_bytes INTEGER NOT NULL DEFAULT 0 CHECK (asset_bytes >= 0)
);

INSERT INTO mithrilpress_deployment_media_usage (singleton, asset_bytes) VALUES (1, 0);

CREATE TRIGGER media_assets_storage_guard_insert
BEFORE INSERT ON media_assets
BEGIN
  SELECT CASE WHEN COALESCE((SELECT asset_bytes FROM mithrilpress_site_media_usage WHERE site_id = NEW.site_id), 0) + NEW.byte_length > 262144000
    THEN RAISE(ABORT, 'site_media_quota_exceeded') END;
  SELECT CASE WHEN (SELECT asset_bytes FROM mithrilpress_deployment_media_usage WHERE singleton = 1) + NEW.byte_length > 8589934592
    THEN RAISE(ABORT, 'deployment_media_quota_exceeded') END;
END;

CREATE TRIGGER media_assets_storage_count_insert
AFTER INSERT ON media_assets
BEGIN
  INSERT INTO mithrilpress_site_media_usage (site_id, asset_bytes)
    VALUES (NEW.site_id, NEW.byte_length)
    ON CONFLICT(site_id) DO UPDATE SET asset_bytes = asset_bytes + NEW.byte_length;
  UPDATE mithrilpress_deployment_media_usage
    SET asset_bytes = asset_bytes + NEW.byte_length
    WHERE singleton = 1;
END;

CREATE TRIGGER media_assets_storage_count_delete
AFTER DELETE ON media_assets
BEGIN
  UPDATE mithrilpress_site_media_usage
    SET asset_bytes = asset_bytes - OLD.byte_length
    WHERE site_id = OLD.site_id;
  UPDATE mithrilpress_deployment_media_usage
    SET asset_bytes = asset_bytes - OLD.byte_length
    WHERE singleton = 1;
END;

CREATE TRIGGER media_assets_payload_immutable
BEFORE UPDATE ON media_assets
WHEN NEW.id IS NOT OLD.id
  OR NEW.site_id IS NOT OLD.site_id
  OR NEW.wordpress_source_id IS NOT OLD.wordpress_source_id
  OR NEW.object_key IS NOT OLD.object_key
  OR NEW.content_type IS NOT OLD.content_type
  OR NEW.byte_length IS NOT OLD.byte_length
  OR NEW.width IS NOT OLD.width
  OR NEW.height IS NOT OLD.height
  OR NEW.sha256 IS NOT OLD.sha256
  OR NEW.alt_text IS NOT OLD.alt_text
  OR NEW.uploaded_by_token_id IS NOT OLD.uploaded_by_token_id
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'media_asset_payload_immutable');
END;

CREATE TABLE media_daily_operations (
  day_utc TEXT PRIMARY KEY,
  read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0),
  write_count INTEGER NOT NULL DEFAULT 0 CHECK (write_count >= 0)
);

CREATE TABLE media_actions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  media_id INTEGER NOT NULL,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('media-uploaded', 'media-deleted')),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE INDEX media_actions_by_site_time ON media_actions(site_id, created_at);

CREATE TRIGGER media_actions_no_update
BEFORE UPDATE ON media_actions
BEGIN
  SELECT RAISE(ABORT, 'media_audit_is_append_only');
END;

CREATE TRIGGER media_actions_no_delete
BEFORE DELETE ON media_actions
BEGIN
  SELECT RAISE(ABORT, 'media_audit_is_append_only');
END;
