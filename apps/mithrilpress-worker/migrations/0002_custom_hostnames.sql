CREATE TABLE site_hostnames (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'ownership_pending', 'provider_pending', 'provider_creating', 'tls_pending', 'dns_pending',
    'active', 'action_required', 'suspended', 'detaching', 'detached'
  )),
  owner_token_id TEXT NOT NULL,
  ownership_txt_name TEXT NOT NULL,
  ownership_txt_value TEXT,
  ownership_expires_at TEXT NOT NULL,
  ownership_verified_at TEXT,
  provider_hostname_id TEXT UNIQUE,
  provider_status TEXT,
  certificate_status TEXT,
  cname_target TEXT,
  validation_records_json TEXT NOT NULL DEFAULT '[]',
  last_checked_at TEXT,
  last_verified_at TEXT,
  health_check_failures INTEGER NOT NULL DEFAULT 0 CHECK (health_check_failures BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  activated_at TEXT,
  detached_at TEXT,
  UNIQUE (site_id, id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (site_id, owner_token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

-- Keep historical detached rows and allow concurrent ownership challenges.
-- A hostname becomes globally exclusive only after an owner proves control.
CREATE UNIQUE INDEX site_hostnames_claimed_hostname
  ON site_hostnames(hostname)
  WHERE status NOT IN ('ownership_pending', 'detached');

CREATE INDEX site_hostnames_by_site_status ON site_hostnames(site_id, status, created_at);
CREATE INDEX site_hostnames_by_health_check ON site_hostnames(status, last_checked_at);
CREATE INDEX site_hostnames_by_provider_id ON site_hostnames(provider_hostname_id);

CREATE TABLE domain_actions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  hostname_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (site_id, hostname_id) REFERENCES site_hostnames(site_id, id),
  FOREIGN KEY (site_id, token_id) REFERENCES tenant_owner_tokens(site_id, token_id)
);

CREATE INDEX domain_actions_by_hostname_time ON domain_actions(site_id, hostname_id, created_at);
