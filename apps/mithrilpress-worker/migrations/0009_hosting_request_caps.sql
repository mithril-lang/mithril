PRAGMA foreign_keys = ON;

-- Public page and read-only WordPress REST traffic is metered separately from
-- media operations. One row per site and deployment is reused at UTC rollover.
CREATE TABLE mithrilpress_deployment_daily_requests (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  day_utc TEXT NOT NULL CHECK (length(day_utc) = 10),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 25000)
);

CREATE TABLE mithrilpress_site_daily_requests (
  site_id TEXT PRIMARY KEY,
  day_utc TEXT NOT NULL CHECK (length(day_utc) = 10),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 5000),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TRIGGER mithrilpress_deployment_daily_requests_guard_insert
BEFORE INSERT ON mithrilpress_deployment_daily_requests
BEGIN
  SELECT CASE WHEN NEW.request_count <> 1
    THEN RAISE(ABORT, 'deployment_daily_hosting_request_increment_invalid') END;
END;

CREATE TRIGGER mithrilpress_deployment_daily_requests_guard_update
BEFORE UPDATE ON mithrilpress_deployment_daily_requests
BEGIN
  SELECT CASE WHEN NEW.day_utc = OLD.day_utc AND NEW.request_count <> OLD.request_count + 1
    THEN RAISE(ABORT, 'deployment_daily_hosting_request_increment_invalid') END;
  SELECT CASE WHEN NEW.day_utc <> OLD.day_utc AND NEW.request_count <> 1
    THEN RAISE(ABORT, 'deployment_daily_hosting_request_reset_invalid') END;
  SELECT CASE WHEN NEW.day_utc = OLD.day_utc AND OLD.request_count >= 25000
    THEN RAISE(ABORT, 'deployment_daily_hosting_request_limit') END;
END;

CREATE TRIGGER mithrilpress_site_daily_requests_guard_insert
BEFORE INSERT ON mithrilpress_site_daily_requests
BEGIN
  SELECT CASE WHEN NEW.request_count <> 1
    THEN RAISE(ABORT, 'site_daily_hosting_request_increment_invalid') END;
END;

CREATE TRIGGER mithrilpress_site_daily_requests_guard_update
BEFORE UPDATE ON mithrilpress_site_daily_requests
BEGIN
  SELECT CASE WHEN NEW.day_utc = OLD.day_utc AND NEW.request_count <> OLD.request_count + 1
    THEN RAISE(ABORT, 'site_daily_hosting_request_increment_invalid') END;
  SELECT CASE WHEN NEW.day_utc <> OLD.day_utc AND NEW.request_count <> 1
    THEN RAISE(ABORT, 'site_daily_hosting_request_reset_invalid') END;
  SELECT CASE WHEN NEW.day_utc = OLD.day_utc AND OLD.request_count >= 5000
    THEN RAISE(ABORT, 'site_daily_hosting_request_limit') END;
END;
