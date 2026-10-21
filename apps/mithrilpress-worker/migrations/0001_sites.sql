PRAGMA foreign_keys = ON;

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  source_origin TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  current_revision_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE site_revisions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  parent_revision_id TEXT,
  state TEXT NOT NULL
    CHECK (state IN ('importing', 'private-preview', 'approved', 'published', 'superseded', 'failed')),
  revision_origin TEXT NOT NULL DEFAULT 'wordpress'
    CHECK (revision_origin IN ('wordpress', 'chat')),
  source_origin TEXT,
  import_proof_id TEXT,
  import_token_id TEXT,
  imported_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count BETWEEN 1 AND 500),
  approved_at TEXT,
  approved_by TEXT,
  approval_proof_id TEXT,
  published_at TEXT,
  published_by TEXT,
  UNIQUE (site_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, parent_revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE INDEX site_revisions_by_site_state ON site_revisions(site_id, state, imported_at);

CREATE TABLE entries (
  site_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('post', 'page')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  source_html TEXT NOT NULL,
  safe_html TEXT NOT NULL,
  entry_origin TEXT NOT NULL DEFAULT 'wordpress'
    CHECK (entry_origin IN ('wordpress', 'chat')),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published')),
  language_code TEXT NOT NULL DEFAULT 'und',
  api_id INTEGER NOT NULL CHECK (api_id > 0),
  source_id INTEGER CHECK (source_id IS NULL OR source_id > 0),
  source_status TEXT NOT NULL,
  source_date TEXT,
  source_date_gmt TEXT,
  source_modified TEXT,
  source_modified_gmt TEXT,
  source_permalink TEXT,
  categories_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  featured_media_id INTEGER,
  rendering_admission TEXT NOT NULL CHECK (rendering_admission = 'ready'),
  PRIMARY KEY (site_id, revision_id, entry_id),
  UNIQUE (site_id, revision_id, kind, slug),
  UNIQUE (site_id, revision_id, kind, api_id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE INDEX entries_by_published_kind_slug ON entries(site_id, revision_id, kind, slug);
CREATE INDEX entries_by_source_date ON entries(site_id, revision_id, source_date);
CREATE INDEX entries_by_publication_status ON entries(site_id, revision_id, publication_status, kind, source_date);

CREATE TABLE tenant_owner_tokens (
  site_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  owner_label TEXT NOT NULL,
  salt_hex TEXT NOT NULL CHECK (length(salt_hex) = 32),
  secret_hash_hex TEXT NOT NULL CHECK (length(secret_hash_hex) = 64),
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (site_id, token_id),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE studio_sessions (
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  salt_hex TEXT NOT NULL CHECK (length(salt_hex) = 32),
  secret_hash_hex TEXT NOT NULL CHECK (length(secret_hash_hex) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (site_id, session_id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE INDEX studio_sessions_by_expiry ON studio_sessions(site_id, expires_at);

CREATE TABLE studio_conversations (
  site_id TEXT NOT NULL,
  id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  base_revision_id TEXT,
  draft_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id),
  FOREIGN KEY (site_id, base_revision_id) REFERENCES site_revisions(site_id, id),
  FOREIGN KEY (site_id, draft_revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE INDEX studio_conversations_by_owner ON studio_conversations(site_id, token_id, updated_at);

CREATE TABLE studio_messages (
  site_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  body TEXT NOT NULL CHECK (length(body) <= 3000),
  created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, conversation_id, id),
  FOREIGN KEY (site_id, conversation_id) REFERENCES studio_conversations(site_id, id)
);

CREATE INDEX studio_messages_by_conversation ON studio_messages(site_id, conversation_id, created_at);

CREATE TABLE studio_ai_usage (
  day_utc TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 0 AND 8)
);

CREATE TABLE owner_approvals (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  proof_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE TABLE owner_actions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  revision_id TEXT,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('import', 'approve', 'publish', 'chat-generate')),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE INDEX owner_actions_by_site_time ON owner_actions(site_id, created_at);
