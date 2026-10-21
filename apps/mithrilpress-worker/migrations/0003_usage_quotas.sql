PRAGMA foreign_keys = ON;

-- These counters cover retained entry payload only. They are application
-- guardrails, not a measurement of the D1 database file or provider usage.
CREATE TABLE mithrilpress_site_storage_usage (
  site_id TEXT PRIMARY KEY,
  content_bytes INTEGER NOT NULL DEFAULT 0 CHECK (content_bytes >= 0),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE mithrilpress_deployment_storage_usage (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  content_bytes INTEGER NOT NULL DEFAULT 0 CHECK (content_bytes >= 0)
);

INSERT INTO mithrilpress_deployment_storage_usage (singleton, content_bytes) VALUES (1, 0);

INSERT INTO mithrilpress_site_storage_usage (site_id, content_bytes)
SELECT site_id, SUM(
  COALESCE(length(CAST(site_id AS BLOB)), 0)
  + COALESCE(length(CAST(revision_id AS BLOB)), 0)
  + COALESCE(length(CAST(entry_id AS BLOB)), 0)
  + COALESCE(length(CAST(kind AS BLOB)), 0)
  + COALESCE(length(CAST(slug AS BLOB)), 0)
  + COALESCE(length(CAST(title AS BLOB)), 0)
  + COALESCE(length(CAST(source_html AS BLOB)), 0)
  + COALESCE(length(CAST(safe_html AS BLOB)), 0)
  + COALESCE(length(CAST(entry_origin AS BLOB)), 0)
  + COALESCE(length(CAST(language_code AS BLOB)), 0)
  + COALESCE(length(CAST(source_status AS BLOB)), 0)
  + COALESCE(length(CAST(source_date AS BLOB)), 0)
  + COALESCE(length(CAST(source_date_gmt AS BLOB)), 0)
  + COALESCE(length(CAST(source_modified AS BLOB)), 0)
  + COALESCE(length(CAST(source_modified_gmt AS BLOB)), 0)
  + COALESCE(length(CAST(source_permalink AS BLOB)), 0)
  + COALESCE(length(CAST(categories_json AS BLOB)), 0)
  + COALESCE(length(CAST(tags_json AS BLOB)), 0)
  + COALESCE(length(CAST(rendering_admission AS BLOB)), 0)
)
FROM entries
GROUP BY site_id;

UPDATE mithrilpress_deployment_storage_usage
SET content_bytes = COALESCE((SELECT SUM(content_bytes) FROM mithrilpress_site_storage_usage), 0)
WHERE singleton = 1;

CREATE TRIGGER entries_storage_guard_insert
BEFORE INSERT ON entries
BEGIN
  SELECT CASE WHEN COALESCE((SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = NEW.site_id), 0) + (
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.kind AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.title AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.safe_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_origin AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.language_code AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_status AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_permalink AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.categories_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.tags_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.rendering_admission AS BLOB)), 0)
  ) > 16777216 THEN RAISE(ABORT, 'site_storage_quota_exceeded') END;

  SELECT CASE WHEN (SELECT content_bytes FROM mithrilpress_deployment_storage_usage WHERE singleton = 1) + (
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.kind AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.title AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.safe_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_origin AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.language_code AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_status AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_permalink AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.categories_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.tags_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.rendering_admission AS BLOB)), 0)
  ) > 268435456 THEN RAISE(ABORT, 'deployment_storage_quota_exceeded') END;
END;

CREATE TRIGGER entries_storage_count_insert
AFTER INSERT ON entries
BEGIN
  INSERT INTO mithrilpress_site_storage_usage (site_id, content_bytes)
  VALUES (NEW.site_id,
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.kind AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.title AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.safe_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_origin AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.language_code AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_status AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_permalink AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.categories_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.tags_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.rendering_admission AS BLOB)), 0)
  )
  ON CONFLICT(site_id) DO UPDATE SET content_bytes = content_bytes + excluded.content_bytes;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes +
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.kind AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.title AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.safe_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_origin AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.language_code AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_status AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_date_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_modified_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.source_permalink AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.categories_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.tags_json AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.rendering_admission AS BLOB)), 0)
  WHERE singleton = 1;
END;

CREATE TRIGGER entries_storage_count_delete
AFTER DELETE ON entries
BEGIN
  UPDATE mithrilpress_site_storage_usage
  SET content_bytes = content_bytes - (
    COALESCE(length(CAST(OLD.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.kind AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.slug AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.title AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_html AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.safe_html AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.entry_origin AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.language_code AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_status AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_date AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_date_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_modified AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_modified_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_permalink AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.categories_json AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.tags_json AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.rendering_admission AS BLOB)), 0)
  )
  WHERE site_id = OLD.site_id;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes - (
    COALESCE(length(CAST(OLD.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.kind AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.slug AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.title AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_html AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.safe_html AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.entry_origin AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.language_code AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_status AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_date AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_date_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_modified AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_modified_gmt AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.source_permalink AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.categories_json AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.tags_json AS BLOB)), 0)
    + COALESCE(length(CAST(OLD.rendering_admission AS BLOB)), 0)
  )
  WHERE singleton = 1;
END;

-- Published/draft state changes are allowed, but content and tenant identity
-- stay immutable so the usage counters cannot drift through ordinary writes.
CREATE TRIGGER entries_payload_immutable
BEFORE UPDATE ON entries
WHEN NEW.site_id IS NOT OLD.site_id
  OR NEW.revision_id IS NOT OLD.revision_id
  OR NEW.entry_id IS NOT OLD.entry_id
  OR NEW.kind IS NOT OLD.kind
  OR NEW.slug IS NOT OLD.slug
  OR NEW.title IS NOT OLD.title
  OR NEW.source_html IS NOT OLD.source_html
  OR NEW.safe_html IS NOT OLD.safe_html
  OR NEW.entry_origin IS NOT OLD.entry_origin
  OR NEW.language_code IS NOT OLD.language_code
  OR NEW.api_id IS NOT OLD.api_id
  OR NEW.source_id IS NOT OLD.source_id
  OR NEW.source_status IS NOT OLD.source_status
  OR NEW.source_date IS NOT OLD.source_date
  OR NEW.source_date_gmt IS NOT OLD.source_date_gmt
  OR NEW.source_modified IS NOT OLD.source_modified
  OR NEW.source_modified_gmt IS NOT OLD.source_modified_gmt
  OR NEW.source_permalink IS NOT OLD.source_permalink
  OR NEW.categories_json IS NOT OLD.categories_json
  OR NEW.tags_json IS NOT OLD.tags_json
  OR NEW.featured_media_id IS NOT OLD.featured_media_id
  OR NEW.rendering_admission IS NOT OLD.rendering_admission
BEGIN
  SELECT RAISE(ABORT, 'entry_payload_immutable');
END;
