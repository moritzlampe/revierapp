-- Sprint 58.1g.x — Auto-End-Feature
-- Scheduled job: close hunts inactive for >12h
-- Runs every 30 minutes via pg_cron
-- Requires pg_cron extension enabled in Supabase Dashboard

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION
      'pg_cron extension not enabled. '
      'Activate it: Supabase Dashboard -> Database -> Extensions -> pg_cron';
  END IF;
END $$;

-- Drop existing job if re-running this migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-end-stale-hunts') THEN
    PERFORM cron.unschedule('auto-end-stale-hunts');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-end-stale-hunts',
  '*/30 * * * *',
  $job$
    UPDATE hunts
    SET status   = 'auto_completed',
        ended_at = last_activity_at
    WHERE ended_at IS NULL
      AND last_activity_at < now() - interval '12 hours'
  $job$
);

COMMENT ON EXTENSION pg_cron IS
  'Used by auto-end-stale-hunts job (Sprint 58.1g.x). See migration 040.';
