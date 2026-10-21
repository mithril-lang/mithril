PRAGMA foreign_keys = ON;

-- Inline images are attached only to owner-authorized revisions and tenant assets.
CREATE TABLE entry_media (
  site_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  media_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, revision_id, entry_id, media_id),
  FOREIGN KEY (site_id, revision_id, entry_id)
    REFERENCES entries(site_id, revision_id, entry_id) ON DELETE CASCADE,
  FOREIGN KEY (site_id, media_id)
    REFERENCES media_assets(site_id, id) ON DELETE CASCADE
);

CREATE INDEX entry_media_by_revision_media
  ON entry_media(site_id, revision_id, media_id);
