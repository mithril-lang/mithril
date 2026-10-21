PRAGMA foreign_keys = ON;

-- Preserve only small, static SEO text selected by the importer. Values are
-- immutable with their revision and disappear when the owning entry is removed.
CREATE TABLE entry_seo_metadata (
  site_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (
    length(CAST(metadata_json AS BLOB)) <= 4096
    AND json_valid(metadata_json)
    AND json_type(metadata_json) = 'object'
  ),
  PRIMARY KEY (site_id, revision_id, entry_id),
  FOREIGN KEY (site_id, revision_id, entry_id)
    REFERENCES entries(site_id, revision_id, entry_id) ON DELETE CASCADE
);

CREATE TRIGGER entry_seo_metadata_storage_guard_insert
BEFORE INSERT ON entry_seo_metadata
BEGIN
  SELECT CASE WHEN COALESCE((SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = NEW.site_id), 0) + (
    length(CAST(NEW.site_id AS BLOB))
    + length(CAST(NEW.revision_id AS BLOB))
    + length(CAST(NEW.entry_id AS BLOB))
    + length(CAST(NEW.metadata_json AS BLOB))
  ) > 16777216 THEN RAISE(ABORT, 'site_storage_quota_exceeded') END;

  SELECT CASE WHEN (SELECT content_bytes FROM mithrilpress_deployment_storage_usage WHERE singleton = 1) + (
    length(CAST(NEW.site_id AS BLOB))
    + length(CAST(NEW.revision_id AS BLOB))
    + length(CAST(NEW.entry_id AS BLOB))
    + length(CAST(NEW.metadata_json AS BLOB))
  ) > 268435456 THEN RAISE(ABORT, 'deployment_storage_quota_exceeded') END;
END;

CREATE TRIGGER entry_seo_metadata_storage_count_insert
AFTER INSERT ON entry_seo_metadata
BEGIN
  UPDATE mithrilpress_site_storage_usage
  SET content_bytes = content_bytes
    + length(CAST(NEW.site_id AS BLOB))
    + length(CAST(NEW.revision_id AS BLOB))
    + length(CAST(NEW.entry_id AS BLOB))
    + length(CAST(NEW.metadata_json AS BLOB))
  WHERE site_id = NEW.site_id;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes
    + length(CAST(NEW.site_id AS BLOB))
    + length(CAST(NEW.revision_id AS BLOB))
    + length(CAST(NEW.entry_id AS BLOB))
    + length(CAST(NEW.metadata_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER entry_seo_metadata_storage_count_delete
AFTER DELETE ON entry_seo_metadata
BEGIN
  UPDATE mithrilpress_site_storage_usage
  SET content_bytes = content_bytes
    - length(CAST(OLD.site_id AS BLOB))
    - length(CAST(OLD.revision_id AS BLOB))
    - length(CAST(OLD.entry_id AS BLOB))
    - length(CAST(OLD.metadata_json AS BLOB))
  WHERE site_id = OLD.site_id;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes
    - length(CAST(OLD.site_id AS BLOB))
    - length(CAST(OLD.revision_id AS BLOB))
    - length(CAST(OLD.entry_id AS BLOB))
    - length(CAST(OLD.metadata_json AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER entry_seo_metadata_no_update
BEFORE UPDATE ON entry_seo_metadata
BEGIN
  SELECT RAISE(ABORT, 'entry_seo_metadata_immutable');
END;
