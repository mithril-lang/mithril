PRAGMA foreign_keys = ON;

-- Keep one counter row per site and enforce both per-site fairness and the
-- deployment-wide free-plan cap before any public or owner image is read.
CREATE TABLE media_site_daily_reads (
  site_id TEXT PRIMARY KEY,
  day_utc TEXT NOT NULL CHECK (length(day_utc) = 10),
  read_count INTEGER NOT NULL CHECK (read_count BETWEEN 1 AND 5000),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TRIGGER media_site_daily_reads_guard_insert
BEFORE INSERT ON media_site_daily_reads
BEGIN
  SELECT CASE WHEN NEW.read_count <> 1
    THEN RAISE(ABORT, 'media_site_daily_read_increment_invalid') END;
  SELECT CASE WHEN COALESCE((SELECT read_count FROM media_daily_operations WHERE day_utc = NEW.day_utc), 0) >= 50000
    THEN RAISE(ABORT, 'media_deployment_daily_read_limit') END;
END;

CREATE TRIGGER media_site_daily_reads_guard_update
BEFORE UPDATE ON media_site_daily_reads
BEGIN
  SELECT CASE WHEN NEW.read_count <> CASE
      WHEN NEW.day_utc = OLD.day_utc THEN OLD.read_count + 1
      ELSE 1
    END
    THEN RAISE(ABORT, 'media_site_daily_read_increment_invalid') END;
  SELECT CASE WHEN COALESCE((SELECT read_count FROM media_daily_operations WHERE day_utc = NEW.day_utc), 0) >= 50000
    THEN RAISE(ABORT, 'media_deployment_daily_read_limit') END;
END;

CREATE TRIGGER media_site_daily_reads_count_insert
AFTER INSERT ON media_site_daily_reads
BEGIN
  INSERT INTO media_daily_operations (day_utc, read_count, write_count)
    VALUES (NEW.day_utc, 1, 0)
    ON CONFLICT(day_utc) DO UPDATE SET read_count = read_count + 1;
END;

CREATE TRIGGER media_site_daily_reads_count_update
AFTER UPDATE ON media_site_daily_reads
BEGIN
  INSERT INTO media_daily_operations (day_utc, read_count, write_count)
    VALUES (NEW.day_utc, 1, 0)
    ON CONFLICT(day_utc) DO UPDATE SET read_count = read_count + 1;
END;
