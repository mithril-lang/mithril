PRAGMA foreign_keys = ON;

-- Bound owner chat history independently from published content revisions.
-- The counters are application estimates, not physical D1 usage metrics.
CREATE TABLE mithrilpress_site_conversation_usage (
  site_id TEXT PRIMARY KEY,
  message_bytes INTEGER NOT NULL DEFAULT 0 CHECK (message_bytes >= 0),
  conversation_count INTEGER NOT NULL DEFAULT 0 CHECK (conversation_count >= 0),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE mithrilpress_deployment_conversation_usage (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  message_bytes INTEGER NOT NULL DEFAULT 0 CHECK (message_bytes >= 0),
  conversation_count INTEGER NOT NULL DEFAULT 0 CHECK (conversation_count >= 0)
);

INSERT INTO mithrilpress_deployment_conversation_usage (singleton, message_bytes, conversation_count)
VALUES (1, 0, 0);

INSERT INTO mithrilpress_site_conversation_usage (site_id, message_bytes, conversation_count)
SELECT s.id,
  COALESCE(SUM(length(CAST(m.body AS BLOB))), 0),
  COUNT(DISTINCT c.id)
FROM sites s
LEFT JOIN studio_conversations c ON c.site_id = s.id
LEFT JOIN studio_messages m ON m.site_id = c.site_id AND m.conversation_id = c.id
GROUP BY s.id;

UPDATE mithrilpress_deployment_conversation_usage
SET message_bytes = COALESCE((SELECT SUM(message_bytes) FROM mithrilpress_site_conversation_usage), 0),
    conversation_count = COALESCE((SELECT SUM(conversation_count) FROM mithrilpress_site_conversation_usage), 0)
WHERE singleton = 1;

CREATE INDEX studio_conversations_by_site
  ON studio_conversations(site_id, created_at, id);

CREATE TRIGGER studio_conversation_limit_guard_insert
BEFORE INSERT ON studio_conversations
BEGIN
  SELECT CASE WHEN COALESCE((
    SELECT conversation_count FROM mithrilpress_site_conversation_usage WHERE site_id = NEW.site_id
  ), 0) >= 50 THEN RAISE(ABORT, 'site_conversation_limit_exceeded') END;

  SELECT CASE WHEN (SELECT conversation_count FROM mithrilpress_deployment_conversation_usage WHERE singleton = 1) >= 1000
    THEN RAISE(ABORT, 'deployment_conversation_limit_exceeded') END;
END;

CREATE TRIGGER studio_conversation_count_insert
AFTER INSERT ON studio_conversations
BEGIN
  INSERT INTO mithrilpress_site_conversation_usage (site_id, message_bytes, conversation_count)
  VALUES (NEW.site_id, 0, 1)
  ON CONFLICT(site_id) DO UPDATE SET conversation_count = conversation_count + 1;

  UPDATE mithrilpress_deployment_conversation_usage
  SET conversation_count = conversation_count + 1
  WHERE singleton = 1;
END;

CREATE TRIGGER studio_conversation_count_delete
AFTER DELETE ON studio_conversations
BEGIN
  UPDATE mithrilpress_site_conversation_usage
  SET conversation_count = conversation_count - 1
  WHERE site_id = OLD.site_id;

  UPDATE mithrilpress_deployment_conversation_usage
  SET conversation_count = conversation_count - 1
  WHERE singleton = 1;
END;

CREATE TRIGGER studio_message_quota_guard_insert
BEFORE INSERT ON studio_messages
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM studio_messages
    WHERE site_id = NEW.site_id AND conversation_id = NEW.conversation_id
  ) >= 40 THEN RAISE(ABORT, 'conversation_message_limit_exceeded') END;

  SELECT CASE WHEN COALESCE((
    SELECT message_bytes FROM mithrilpress_site_conversation_usage WHERE site_id = NEW.site_id
  ), 0) + length(CAST(NEW.body AS BLOB)) > 4194304
    THEN RAISE(ABORT, 'site_conversation_storage_quota_exceeded') END;

  SELECT CASE WHEN (SELECT message_bytes FROM mithrilpress_deployment_conversation_usage WHERE singleton = 1)
      + length(CAST(NEW.body AS BLOB)) > 67108864
    THEN RAISE(ABORT, 'deployment_conversation_storage_quota_exceeded') END;
END;

CREATE TRIGGER studio_message_usage_insert
AFTER INSERT ON studio_messages
BEGIN
  INSERT INTO mithrilpress_site_conversation_usage (site_id, message_bytes, conversation_count)
  VALUES (NEW.site_id, length(CAST(NEW.body AS BLOB)), 0)
  ON CONFLICT(site_id) DO UPDATE SET message_bytes = message_bytes + excluded.message_bytes;

  UPDATE mithrilpress_deployment_conversation_usage
  SET message_bytes = message_bytes + length(CAST(NEW.body AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER studio_message_usage_delete
AFTER DELETE ON studio_messages
BEGIN
  UPDATE mithrilpress_site_conversation_usage
  SET message_bytes = message_bytes - length(CAST(OLD.body AS BLOB))
  WHERE site_id = OLD.site_id;

  UPDATE mithrilpress_deployment_conversation_usage
  SET message_bytes = message_bytes - length(CAST(OLD.body AS BLOB))
  WHERE singleton = 1;
END;

CREATE TRIGGER studio_message_immutable
BEFORE UPDATE ON studio_messages
BEGIN
  SELECT RAISE(ABORT, 'studio_message_immutable');
END;
