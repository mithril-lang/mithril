PRAGMA foreign_keys = ON;

ALTER TABLE entries ADD COLUMN parent_source_id INTEGER
  CHECK (parent_source_id IS NULL OR parent_source_id BETWEEN 1 AND 9007199254740991);

CREATE INDEX entries_by_page_source_id
  ON entries(site_id, revision_id, source_id)
  WHERE kind = 'page' AND source_id IS NOT NULL;

-- Parent links are assigned after all entries in a revision exist. This keeps
-- relation checks tenant- and revision-local and avoids import-order coupling.
CREATE TRIGGER entries_page_parent_insert_guard
BEFORE INSERT ON entries
WHEN NEW.parent_source_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'entry_parent_requires_existing_revision_entries');
END;

CREATE TRIGGER entries_page_parent_immutable
BEFORE UPDATE OF parent_source_id ON entries
WHEN OLD.parent_source_id IS NOT NULL
  AND NEW.parent_source_id IS NOT OLD.parent_source_id
BEGIN
  SELECT RAISE(ABORT, 'entry_parent_immutable');
END;

CREATE TRIGGER entries_page_parent_guard_update
BEFORE UPDATE OF parent_source_id ON entries
WHEN NEW.parent_source_id IS NOT NULL
  AND NEW.parent_source_id IS NOT OLD.parent_source_id
BEGIN
  SELECT CASE WHEN NEW.kind <> 'page' OR NEW.source_id IS NULL
    OR NEW.parent_source_id = NEW.source_id
    THEN RAISE(ABORT, 'invalid_entry_page_parent') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM entries parent
    WHERE parent.site_id = NEW.site_id
      AND parent.revision_id = NEW.revision_id
      AND parent.kind = 'page'
      AND parent.source_id = NEW.parent_source_id
  ) THEN RAISE(ABORT, 'unresolved_entry_page_parent') END;

  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE ancestors(source_id, parent_source_id, depth) AS (
      SELECT source_id, parent_source_id, 1
      FROM entries
      WHERE site_id = NEW.site_id
        AND revision_id = NEW.revision_id
        AND kind = 'page'
        AND source_id = NEW.parent_source_id
      UNION ALL
      SELECT parent.source_id, parent.parent_source_id, ancestors.depth + 1
      FROM entries parent
      JOIN ancestors ON parent.source_id = ancestors.parent_source_id
      WHERE parent.site_id = NEW.site_id
        AND parent.revision_id = NEW.revision_id
        AND parent.kind = 'page'
        AND ancestors.parent_source_id IS NOT NULL
        AND ancestors.depth < 65
    )
    SELECT 1 FROM ancestors WHERE source_id = NEW.source_id
  ) THEN RAISE(ABORT, 'cyclic_entry_page_parent') END;

  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE ancestors(source_id, parent_source_id, depth) AS (
      SELECT source_id, parent_source_id, 1
      FROM entries
      WHERE site_id = NEW.site_id
        AND revision_id = NEW.revision_id
        AND kind = 'page'
        AND source_id = NEW.parent_source_id
      UNION ALL
      SELECT parent.source_id, parent.parent_source_id, ancestors.depth + 1
      FROM entries parent
      JOIN ancestors ON parent.source_id = ancestors.parent_source_id
      WHERE parent.site_id = NEW.site_id
        AND parent.revision_id = NEW.revision_id
        AND parent.kind = 'page'
        AND ancestors.parent_source_id IS NOT NULL
        AND ancestors.depth < 65
    )
    SELECT 1 FROM ancestors WHERE depth >= 64 AND parent_source_id IS NOT NULL
  ) THEN RAISE(ABORT, 'entry_page_parent_depth_exceeded') END;

  SELECT CASE WHEN COALESCE((
    SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = NEW.site_id
  ), 0) + length(CAST(NEW.parent_source_id AS BLOB)) > 16777216
    THEN RAISE(ABORT, 'site_storage_quota_exceeded') END;

  SELECT CASE WHEN (
    SELECT content_bytes FROM mithrilpress_deployment_storage_usage WHERE singleton = 1
  ) + length(CAST(NEW.parent_source_id AS BLOB)) > 268435456
    THEN RAISE(ABORT, 'deployment_storage_quota_exceeded') END;
END;

CREATE TRIGGER entries_page_parent_storage_count_update
AFTER UPDATE OF parent_source_id ON entries
WHEN NEW.parent_source_id IS NOT NULL
  AND NEW.parent_source_id IS NOT OLD.parent_source_id
BEGIN
  UPDATE mithrilpress_site_storage_usage
  SET content_bytes = content_bytes + length(CAST(NEW.parent_source_id AS BLOB))
  WHERE site_id = NEW.site_id;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes + length(CAST(NEW.parent_source_id AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER entries_page_parent_storage_count_delete
AFTER DELETE ON entries
WHEN OLD.parent_source_id IS NOT NULL
BEGIN
  UPDATE mithrilpress_site_storage_usage
  SET content_bytes = content_bytes - length(CAST(OLD.parent_source_id AS BLOB))
  WHERE site_id = OLD.site_id;

  UPDATE mithrilpress_deployment_storage_usage
  SET content_bytes = content_bytes - length(CAST(OLD.parent_source_id AS BLOB))
  WHERE singleton = 1;
END;
