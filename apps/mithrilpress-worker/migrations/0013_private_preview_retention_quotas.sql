PRAGMA foreign_keys = ON;

-- Bound retained lifecycle rows independently of daily request quotas. These
-- counters are application guardrails, not measurements of D1 provider usage.
CREATE TABLE mithrilpress_private_preview_site_rows (
  site_id TEXT PRIMARY KEY,
  share_count INTEGER NOT NULL DEFAULT 0 CHECK (share_count >= 0),
  session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE mithrilpress_private_preview_deployment_rows (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  share_count INTEGER NOT NULL DEFAULT 0 CHECK (share_count >= 0),
  session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0)
);

INSERT INTO mithrilpress_private_preview_site_rows (site_id, share_count, session_count, event_count)
SELECT s.id,
  (SELECT COUNT(*) FROM private_preview_shares p WHERE p.site_id = s.id),
  (SELECT COUNT(*) FROM private_preview_share_sessions p WHERE p.site_id = s.id),
  (SELECT COUNT(*) FROM private_preview_share_events p WHERE p.site_id = s.id)
FROM sites s;

INSERT INTO mithrilpress_private_preview_deployment_rows (singleton, share_count, session_count, event_count)
SELECT 1,
  (SELECT COUNT(*) FROM private_preview_shares),
  (SELECT COUNT(*) FROM private_preview_share_sessions),
  (SELECT COUNT(*) FROM private_preview_share_events);

ALTER TABLE private_preview_shares ADD COLUMN cleanup_after TEXT;
UPDATE private_preview_shares
SET cleanup_after = strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(revoked_at, expires_at), '+90 days');

CREATE INDEX private_preview_shares_by_revoked_at
  ON private_preview_shares(revoked_at, site_id, share_id)
  WHERE revoked_at IS NOT NULL;
CREATE INDEX private_preview_shares_by_unrevoked_expiry
  ON private_preview_shares(expires_at, site_id, share_id)
  WHERE revoked_at IS NULL;
CREATE INDEX private_preview_sessions_by_global_expiry
  ON private_preview_share_sessions(expires_at, site_id, session_id);
CREATE INDEX private_preview_events_by_share_time
  ON private_preview_share_events(site_id, share_id, created_at);
CREATE INDEX private_preview_shares_by_cleanup_after
  ON private_preview_shares(cleanup_after, site_id, share_id);

CREATE TRIGGER private_preview_share_cleanup_after_insert
AFTER INSERT ON private_preview_shares
BEGIN
  UPDATE private_preview_shares
  SET cleanup_after = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at, '+90 days')
  WHERE site_id = NEW.site_id AND share_id = NEW.share_id;
END;

CREATE TRIGGER private_preview_share_cleanup_after_revoke
AFTER UPDATE OF revoked_at ON private_preview_shares
WHEN NEW.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN
  UPDATE private_preview_shares
  SET cleanup_after = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at, '+90 days')
  WHERE site_id = NEW.site_id AND share_id = NEW.share_id;
END;

CREATE TRIGGER private_preview_shares_row_guard_insert
BEFORE INSERT ON private_preview_shares
BEGIN
  SELECT CASE WHEN COALESCE((SELECT share_count FROM mithrilpress_private_preview_site_rows WHERE site_id = NEW.site_id), 0) >= 2000
    THEN RAISE(ABORT, 'private_preview_site_share_row_limit') END;
  SELECT CASE WHEN (SELECT share_count FROM mithrilpress_private_preview_deployment_rows WHERE singleton = 1) >= 20000
    THEN RAISE(ABORT, 'private_preview_deployment_share_row_limit') END;
END;

CREATE TRIGGER private_preview_shares_row_count_insert
AFTER INSERT ON private_preview_shares
BEGIN
  INSERT INTO mithrilpress_private_preview_site_rows (site_id, share_count)
  VALUES (NEW.site_id, 1)
  ON CONFLICT(site_id) DO UPDATE SET share_count = share_count + 1;
  UPDATE mithrilpress_private_preview_deployment_rows SET share_count = share_count + 1 WHERE singleton = 1;
END;

CREATE TRIGGER private_preview_shares_row_count_delete
AFTER DELETE ON private_preview_shares
BEGIN
  UPDATE mithrilpress_private_preview_site_rows SET share_count = share_count - 1 WHERE site_id = OLD.site_id;
  UPDATE mithrilpress_private_preview_deployment_rows SET share_count = share_count - 1 WHERE singleton = 1;
END;

CREATE TRIGGER private_preview_shares_site_immutable
BEFORE UPDATE ON private_preview_shares
WHEN NEW.site_id IS NOT OLD.site_id
BEGIN
  SELECT RAISE(ABORT, 'private_preview_share_site_immutable');
END;

CREATE TRIGGER private_preview_share_sessions_row_guard_insert
BEFORE INSERT ON private_preview_share_sessions
BEGIN
  SELECT CASE WHEN COALESCE((SELECT session_count FROM mithrilpress_private_preview_site_rows WHERE site_id = NEW.site_id), 0) >= 2000
    THEN RAISE(ABORT, 'private_preview_site_session_row_limit') END;
  SELECT CASE WHEN (SELECT session_count FROM mithrilpress_private_preview_deployment_rows WHERE singleton = 1) >= 20000
    THEN RAISE(ABORT, 'private_preview_deployment_session_row_limit') END;
END;

CREATE TRIGGER private_preview_share_sessions_row_count_insert
AFTER INSERT ON private_preview_share_sessions
BEGIN
  INSERT INTO mithrilpress_private_preview_site_rows (site_id, session_count)
  VALUES (NEW.site_id, 1)
  ON CONFLICT(site_id) DO UPDATE SET session_count = session_count + 1;
  UPDATE mithrilpress_private_preview_deployment_rows SET session_count = session_count + 1 WHERE singleton = 1;
END;

CREATE TRIGGER private_preview_share_sessions_row_count_delete
AFTER DELETE ON private_preview_share_sessions
BEGIN
  UPDATE mithrilpress_private_preview_site_rows SET session_count = session_count - 1 WHERE site_id = OLD.site_id;
  UPDATE mithrilpress_private_preview_deployment_rows SET session_count = session_count - 1 WHERE singleton = 1;
END;

CREATE TRIGGER private_preview_share_sessions_site_immutable
BEFORE UPDATE ON private_preview_share_sessions
WHEN NEW.site_id IS NOT OLD.site_id
BEGIN
  SELECT RAISE(ABORT, 'private_preview_session_site_immutable');
END;

CREATE TRIGGER private_preview_share_events_row_guard_insert
BEFORE INSERT ON private_preview_share_events
BEGIN
  SELECT CASE WHEN COALESCE((SELECT event_count FROM mithrilpress_private_preview_site_rows WHERE site_id = NEW.site_id), 0) >= 10000
    THEN RAISE(ABORT, 'private_preview_site_event_row_limit') END;
  SELECT CASE WHEN (SELECT event_count FROM mithrilpress_private_preview_deployment_rows WHERE singleton = 1) >= 100000
    THEN RAISE(ABORT, 'private_preview_deployment_event_row_limit') END;
  SELECT CASE WHEN length(CAST(NEW.metadata_json AS BLOB)) > 1024 OR json_valid(NEW.metadata_json) = 0
    THEN RAISE(ABORT, 'private_preview_event_metadata_invalid') END;
END;

CREATE TRIGGER private_preview_share_events_row_count_insert
AFTER INSERT ON private_preview_share_events
BEGIN
  INSERT INTO mithrilpress_private_preview_site_rows (site_id, event_count)
  VALUES (NEW.site_id, 1)
  ON CONFLICT(site_id) DO UPDATE SET event_count = event_count + 1;
  UPDATE mithrilpress_private_preview_deployment_rows SET event_count = event_count + 1 WHERE singleton = 1;
END;

CREATE TRIGGER private_preview_share_events_row_count_delete
AFTER DELETE ON private_preview_share_events
BEGIN
  UPDATE mithrilpress_private_preview_site_rows SET event_count = event_count - 1 WHERE site_id = OLD.site_id;
  UPDATE mithrilpress_private_preview_deployment_rows SET event_count = event_count - 1 WHERE singleton = 1;
END;

CREATE TRIGGER private_preview_share_events_immutable
BEFORE UPDATE ON private_preview_share_events
BEGIN
  SELECT RAISE(ABORT, 'private_preview_event_immutable');
END;
