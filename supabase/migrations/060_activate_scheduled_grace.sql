-- ============================================================
-- Migration 060: Cron activate-scheduled-hunts mit 4h-Karenz
-- ------------------------------------------------------------
-- WAS: Job 3 aus 051 (Abschnitt 4) identisch neu geschedult —
--      einzige Aenderung im WHERE:
--        now() >= scheduled_for   ->   now() >= scheduled_for + interval '4 hours'
--
-- WARUM: Der Leiter-Button (startHunt) ist der Normalweg zum Anblasen und
--        darf jederzeit — auch vor scheduled_for — auf 'active' flippen.
--        Der Cron ist damit KEIN Zeit-Flip zur Planzeit mehr, sondern nur
--        noch die Vergess-Bremse fuer Jagden (v.a. aus der PWA), bei denen
--        niemand getippt hat. Die reale Luecke Planzeit->Anblasen liegt bei
--        Minuten bis wenigen Stunden, 4h schnappt also keiner laufenden Jagd
--        zuvor. Bewusster Preis: komplett vergessenes Anblasen geht 4h nach
--        Planzeit automatisch live — besser als ewige scheduled-Zombies
--        (Job 4 / auto-end-stale-hunts schliesst 'scheduled' vom Auto-End aus).
--
-- Job 4 (auto-end-stale-hunts) wird NICHT angefasst.
-- Idempotent: unschedule-by-name wie 040/051, Re-Run ohne bestehenden Job ok.
-- Stand: 2026-07-11
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION
      'pg_cron extension not enabled. '
      'Activate it: Supabase Dashboard -> Database -> Extensions -> pg_cron';
  END IF;
END $$;

SELECT cron.unschedule('activate-scheduled-hunts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activate-scheduled-hunts');

SELECT cron.schedule(
  'activate-scheduled-hunts',
  '* * * * *',
  $job$
    UPDATE public.hunts
       SET status           = 'active',
           started_at       = COALESCE(started_at, now()),
           last_activity_at = now()
     WHERE status = 'scheduled'
       AND scheduled_for IS NOT NULL
       AND now() >= scheduled_for + interval '4 hours'
  $job$
);

COMMIT;
