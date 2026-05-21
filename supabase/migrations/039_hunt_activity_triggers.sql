-- Sprint 58.1g.x — Auto-End-Feature
-- Triggers that maintain hunts.last_activity_at on signal tables
-- Heartbeat sources: positions_current, messages, kills
-- Throttle: only update if last_activity_at older than 1 minute
-- (saves ~90% of writes from high-frequency GPS pings)

CREATE OR REPLACE FUNCTION update_hunt_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.hunt_id IS NOT NULL THEN
    UPDATE hunts
    SET last_activity_at = now()
    WHERE id = NEW.hunt_id
      AND ended_at IS NULL
      AND last_activity_at < now() - interval '1 minute';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_hunt_last_activity() IS
  'Heartbeat for Auto-End feature. Updates hunts.last_activity_at '
  'when activity occurs on linked tables. Throttled to 1 minute '
  'granularity to reduce write load from GPS pings.';

-- positions_current: hunt_id NOT NULL, fires on every UPSERT
DROP TRIGGER IF EXISTS trg_positions_current_activity ON positions_current;
CREATE TRIGGER trg_positions_current_activity
  AFTER INSERT OR UPDATE ON positions_current
  FOR EACH ROW EXECUTE FUNCTION update_hunt_last_activity();

-- messages: hunt_id nullable; trigger handles via IS NOT NULL check
DROP TRIGGER IF EXISTS trg_messages_activity ON messages;
CREATE TRIGGER trg_messages_activity
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_hunt_last_activity();

-- kills: hunt_id nullable; trigger handles via IS NOT NULL check
DROP TRIGGER IF EXISTS trg_kills_activity ON kills;
CREATE TRIGGER trg_kills_activity
  AFTER INSERT OR UPDATE ON kills
  FOR EACH ROW EXECUTE FUNCTION update_hunt_last_activity();
