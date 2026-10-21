PRAGMA foreign_keys = ON;

CREATE TABLE taxonomy_terms (
  site_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  taxonomy TEXT NOT NULL CHECK (taxonomy IN ('category', 'post_tag')),
  term_id INTEGER NOT NULL CHECK (term_id > 0),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description_html TEXT NOT NULL DEFAULT '',
  parent_term_id INTEGER NOT NULL DEFAULT 0 CHECK (parent_term_id >= 0),
  PRIMARY KEY (site_id, revision_id, taxonomy, term_id),
  UNIQUE (site_id, revision_id, taxonomy, slug),
  FOREIGN KEY (site_id, revision_id) REFERENCES site_revisions(site_id, id) ON DELETE CASCADE
);

CREATE INDEX taxonomy_terms_by_name ON taxonomy_terms(site_id, revision_id, taxonomy, name, term_id);

CREATE TRIGGER taxonomy_terms_storage_guard_insert
BEFORE INSERT ON taxonomy_terms
BEGIN
  SELECT CASE WHEN COALESCE((SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = NEW.site_id), 0) + (
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.taxonomy AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.term_id AS TEXT)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.name AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.description_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.parent_term_id AS TEXT)), 0)
  ) > 16777216 THEN RAISE(ABORT, 'site_storage_quota_exceeded') END;

  SELECT CASE WHEN (SELECT content_bytes FROM mithrilpress_deployment_storage_usage WHERE singleton = 1) + (
    COALESCE(length(CAST(NEW.site_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.revision_id AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.taxonomy AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.term_id AS TEXT)), 0)
    + COALESCE(length(CAST(NEW.slug AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.name AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.description_html AS BLOB)), 0)
    + COALESCE(length(CAST(NEW.parent_term_id AS TEXT)), 0)
  ) > 268435456 THEN RAISE(ABORT, 'deployment_storage_quota_exceeded') END;
END;

CREATE TRIGGER taxonomy_terms_storage_count_insert
AFTER INSERT ON taxonomy_terms
BEGIN
  UPDATE mithrilpress_site_storage_usage SET content_bytes = content_bytes
    + length(CAST(NEW.site_id AS BLOB))
    + length(CAST(NEW.revision_id AS BLOB))
    + length(CAST(NEW.taxonomy AS BLOB))
    + length(CAST(NEW.term_id AS TEXT))
    + length(CAST(NEW.slug AS BLOB))
    + length(CAST(NEW.name AS BLOB))
    + length(CAST(NEW.description_html AS BLOB))
    + length(CAST(NEW.parent_term_id AS TEXT))
  WHERE site_id = NEW.site_id;
  UPDATE mithrilpress_deployment_storage_usage SET content_bytes = content_bytes
    + length(CAST(NEW.site_id AS BLOB))
    + length(CAST(NEW.revision_id AS BLOB))
    + length(CAST(NEW.taxonomy AS BLOB))
    + length(CAST(NEW.term_id AS TEXT))
    + length(CAST(NEW.slug AS BLOB))
    + length(CAST(NEW.name AS BLOB))
    + length(CAST(NEW.description_html AS BLOB))
    + length(CAST(NEW.parent_term_id AS TEXT))
  WHERE singleton = 1;
END;

CREATE TRIGGER taxonomy_terms_storage_count_delete
AFTER DELETE ON taxonomy_terms
BEGIN
  UPDATE mithrilpress_site_storage_usage SET content_bytes = content_bytes
    - length(CAST(OLD.site_id AS BLOB))
    - length(CAST(OLD.revision_id AS BLOB))
    - length(CAST(OLD.taxonomy AS BLOB))
    - length(CAST(OLD.term_id AS TEXT))
    - length(CAST(OLD.slug AS BLOB))
    - length(CAST(OLD.name AS BLOB))
    - length(CAST(OLD.description_html AS BLOB))
    - length(CAST(OLD.parent_term_id AS TEXT))
  WHERE site_id = OLD.site_id;
  UPDATE mithrilpress_deployment_storage_usage SET content_bytes = content_bytes
    - length(CAST(OLD.site_id AS BLOB))
    - length(CAST(OLD.revision_id AS BLOB))
    - length(CAST(OLD.taxonomy AS BLOB))
    - length(CAST(OLD.term_id AS TEXT))
    - length(CAST(OLD.slug AS BLOB))
    - length(CAST(OLD.name AS BLOB))
    - length(CAST(OLD.description_html AS BLOB))
    - length(CAST(OLD.parent_term_id AS TEXT))
  WHERE singleton = 1;
END;

CREATE TRIGGER taxonomy_terms_no_update
BEFORE UPDATE ON taxonomy_terms
BEGIN
  SELECT RAISE(ABORT, 'taxonomy_term_immutable');
END;
