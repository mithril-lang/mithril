PRAGMA foreign_keys = ON;

-- Record historical publication restores as a distinct owner action.
CREATE TABLE owner_actions_new (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  revision_id TEXT,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('import', 'approve', 'publish', 'restore', 'chat-generate', 'manual-draft')),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

INSERT INTO owner_actions_new (id, site_id, revision_id, token_id, action, created_at, metadata_json)
SELECT id, site_id, revision_id, token_id, action, created_at, metadata_json
FROM owner_actions;

DROP TABLE owner_actions;
ALTER TABLE owner_actions_new RENAME TO owner_actions;

CREATE INDEX owner_actions_by_site_time ON owner_actions(site_id, created_at);

-- Rebuilding owner_actions drops table-bound triggers from migration 0017.
-- Restore the append-only audit guard after the table replacement.
CREATE TRIGGER owner_actions_immutable_update
BEFORE UPDATE ON owner_actions
BEGIN
  SELECT RAISE(ABORT, 'owner_action_immutable');
END;

CREATE TRIGGER owner_actions_immutable_delete
BEFORE DELETE ON owner_actions
BEGIN
  SELECT RAISE(ABORT, 'owner_action_immutable');
END;
