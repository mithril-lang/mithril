PRAGMA foreign_keys = ON;

-- Manual drafts retain their full text in the conversation transcript. Keep the
-- existing byte quotas while admitting the endpoint's documented 100,000-character limit.
CREATE TABLE studio_messages_rebuilt (
  site_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  body TEXT NOT NULL CHECK (length(body) <= 100000),
  created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, conversation_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, conversation_id) REFERENCES studio_conversations(site_id, id)
);

INSERT INTO studio_messages_rebuilt (site_id, conversation_id, id, role, body, created_at)
SELECT site_id, conversation_id, id, role, body, created_at
FROM studio_messages;

DROP TABLE studio_messages;
ALTER TABLE studio_messages_rebuilt RENAME TO studio_messages;

CREATE INDEX studio_messages_by_conversation
  ON studio_messages(site_id, conversation_id, created_at);

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

CREATE TABLE owner_actions_rebuilt (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  revision_id TEXT,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('import', 'approve', 'publish', 'chat-generate', 'manual-draft')),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

INSERT INTO owner_actions_rebuilt (
  id, site_id, revision_id, token_id, action, created_at, metadata_json
)
SELECT id, site_id, revision_id, token_id, action, created_at, metadata_json
FROM owner_actions;

DROP TABLE owner_actions;
ALTER TABLE owner_actions_rebuilt RENAME TO owner_actions;
CREATE INDEX owner_actions_by_site_time ON owner_actions(site_id, created_at);
