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
  state TEXT NOT NULL
    CHECK (state IN ('importing', 'private-preview', 'approved', 'published', 'superseded', 'failed')),
  source_origin TEXT NOT NULL,
  import_proof_id TEXT NOT NULL,
  import_token_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count BETWEEN 1 AND 500),
  approved_at TEXT,
  approved_by TEXT,
  approval_proof_id TEXT,
  published_at TEXT,
  published_by TEXT,
  UNIQUE (site_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id)
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
  source_id INTEGER NOT NULL CHECK (source_id > 0),
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
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE INDEX entries_by_published_kind_slug ON entries(site_id, revision_id, kind, slug);
CREATE INDEX entries_by_source_date ON entries(site_id, revision_id, source_date);

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
  action TEXT NOT NULL CHECK (action IN ('import', 'approve', 'publish')),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id)
);

CREATE INDEX owner_actions_by_site_time ON owner_actions(site_id, created_at);
