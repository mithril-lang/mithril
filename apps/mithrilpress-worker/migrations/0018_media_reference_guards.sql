PRAGMA foreign_keys = ON;

-- A media deletion may race an import or chat draft that already validated the
-- asset. Restrict new references to active media so a deleting row cannot be
-- reattached after the deletion path checks existing references.
-- A delete_operation_id commits a deletion after the reference check. Once set,
-- retries may finish removing the R2 object but cannot restore the media row.
ALTER TABLE media_assets ADD COLUMN delete_operation_id TEXT;

CREATE TRIGGER media_assets_delete_operation_guard
BEFORE UPDATE OF status, delete_operation_id ON media_assets
WHEN (OLD.delete_operation_id IS NOT NULL AND NEW.delete_operation_id IS NOT OLD.delete_operation_id)
  OR (NEW.delete_operation_id IS NOT NULL AND NEW.status <> 'deleting')
BEGIN
  SELECT RAISE(ABORT, 'media_delete_operation_committed');
END;

CREATE TRIGGER entries_featured_media_active_insert
BEFORE INSERT ON entries
WHEN NEW.featured_media_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM media_assets a
    WHERE a.site_id = NEW.site_id
      AND a.status = 'active'
      AND (a.id = NEW.featured_media_id OR a.wordpress_source_id = NEW.featured_media_id)
  )
BEGIN
  SELECT RAISE(ABORT, 'featured_media_not_active');
END;

CREATE TRIGGER entries_featured_media_active_update
BEFORE UPDATE OF site_id, featured_media_id ON entries
WHEN NEW.featured_media_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM media_assets a
    WHERE a.site_id = NEW.site_id
      AND a.status = 'active'
      AND (a.id = NEW.featured_media_id OR a.wordpress_source_id = NEW.featured_media_id)
  )
BEGIN
  SELECT RAISE(ABORT, 'featured_media_not_active');
END;

CREATE TRIGGER entry_media_active_insert
BEFORE INSERT ON entry_media
WHEN NOT EXISTS (
  SELECT 1 FROM media_assets a
  WHERE a.site_id = NEW.site_id AND a.id = NEW.media_id AND a.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'entry_media_not_active');
END;

CREATE TRIGGER entry_media_active_update
BEFORE UPDATE OF site_id, media_id ON entry_media
WHEN NOT EXISTS (
  SELECT 1 FROM media_assets a
  WHERE a.site_id = NEW.site_id AND a.id = NEW.media_id AND a.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'entry_media_not_active');
END;

CREATE INDEX entries_by_site_featured_media
  ON entries(site_id, featured_media_id)
  WHERE featured_media_id IS NOT NULL;

CREATE INDEX entry_media_by_site_media
  ON entry_media(site_id, media_id);
