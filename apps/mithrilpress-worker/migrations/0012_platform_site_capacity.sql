PRAGMA foreign_keys = ON;

-- Keep platform hosting within the first exact-Worker-Domain cohort. A deleted
-- site does not consume a product slot, but suspended sites still do because
-- their hostnames may remain attached while an operator investigates them.
CREATE TRIGGER mithrilpress_platform_site_capacity_guard_insert
BEFORE INSERT ON sites
WHEN NEW.status <> 'deleted'
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM sites WHERE status <> 'deleted') >= 90
    THEN RAISE(ABORT, 'mithrilpress_platform_site_limit') END;
END;

CREATE TRIGGER mithrilpress_platform_site_capacity_guard_restore
BEFORE UPDATE OF status ON sites
WHEN OLD.status = 'deleted' AND NEW.status <> 'deleted'
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM sites WHERE status <> 'deleted') >= 90
    THEN RAISE(ABORT, 'mithrilpress_platform_site_limit') END;
END;
