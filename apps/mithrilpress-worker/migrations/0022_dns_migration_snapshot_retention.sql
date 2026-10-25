ALTER TABLE dns_migrations ADD COLUMN snapshots_erased_at TEXT;

CREATE INDEX dns_migrations_snapshot_retention_candidates
  ON dns_migrations(updated_at, id)
  WHERE snapshots_erased_at IS NULL AND status <> 'ownership_pending';

CREATE INDEX dns_migrations_ownership_challenge_expiry
  ON dns_migrations(ownership_expires_at, id)
  WHERE snapshots_erased_at IS NULL AND status = 'ownership_pending';
