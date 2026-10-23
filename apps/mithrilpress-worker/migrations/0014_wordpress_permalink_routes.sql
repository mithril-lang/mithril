PRAGMA foreign_keys = ON;

-- Keep source WordPress URL paths on imported entries. Chat-authored entries
-- use their normal one-segment slug route.
ALTER TABLE entries ADD COLUMN route_path TEXT;

UPDATE entries
SET route_path = CASE
  WHEN kind = 'page' AND slug = 'home' THEN '/'
  ELSE '/' || slug || '/'
END;

CREATE INDEX entries_by_route_path
  ON entries(site_id, revision_id, route_path, publication_status);

-- Backfill the existing retained-content counters for the new route metadata.
UPDATE mithrilpress_site_storage_usage
SET content_bytes = content_bytes + COALESCE((
  SELECT SUM(length(CAST(e.route_path AS BLOB)))
  FROM entries e
  WHERE e.site_id = mithrilpress_site_storage_usage.site_id
), 0);

UPDATE mithrilpress_deployment_storage_usage
SET content_bytes = COALESCE((SELECT SUM(content_bytes) FROM mithrilpress_site_storage_usage), 0)
WHERE singleton = 1;

CREATE TRIGGER entries_route_path_guard_insert
BEFORE INSERT ON entries
BEGIN
  SELECT CASE WHEN NEW.route_path IS NULL
    OR length(CAST(NEW.route_path AS BLOB)) NOT BETWEEN 1 AND 2048
    OR substr(NEW.route_path, 1, 1) <> '/'
    OR substr(NEW.route_path, 1, 2) = '//'
    THEN RAISE(ABORT, 'invalid_entry_route_path') END;

  SELECT CASE WHEN COALESCE((SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = NEW.site_id), 0) + (
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.entry_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.kind AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.route_path AS BLOB)), 0)
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
    + COALESCE(length(CAST(NEW.route_path AS BLOB)), 0)
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

CREATE TRIGGER entries_route_path_storage_count_insert
AFTER INSERT ON entries
BEGIN
  INSERT INTO mithrilpress_site_storage_usage (site_id, content_bytes)
  VALUES (NEW.site_id, length(CAST(NEW.route_path AS BLOB)))
  ON CONFLICT(site_id) DO UPDATE SET content_bytes = content_bytes + excluded.content_bytes;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes + length(CAST(NEW.route_path AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER entries_route_path_storage_count_delete
AFTER DELETE ON entries
BEGIN
  UPDATE mithrilpress_site_storage_usage
  SET content_bytes = content_bytes - length(CAST(OLD.route_path AS BLOB))
  WHERE site_id = OLD.site_id;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes - length(CAST(OLD.route_path AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER entries_route_path_immutable
BEFORE UPDATE ON entries
WHEN NEW.route_path IS NOT OLD.route_path
BEGIN
  SELECT RAISE(ABORT, 'entry_route_path_immutable');
END;
