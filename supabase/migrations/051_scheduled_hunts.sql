-- ============================================================
-- Migration 051: Geplante Jagden + Chat-Gate + RSVP-Notify (Sprint C)
-- ------------------------------------------------------------
-- Setzt L1–L6 des Impl-Briefs um. VORAUSSETZUNG: 050 ist committed
-- (Enum-Wert 'scheduled' existiert) — sonst schlagen die Cron-Job-
-- Bodies spaeter beim Lauf fehl.
--
-- Inhalt (in dieser Reihenfolge):
--   1) hunts.scheduled_for (Plan-Start, nullable) + hunts.chat_open
--   2) Enum notify_on_rsvp + hunts.notify_on_rsvp
--   3) messages_insert_member: Chat-Schreibrecht in scheduled
--   4) Cron activate-scheduled-hunts  (scheduled -> active)
--   5) Cron auto-end-stale-hunts neu  (mit status <> 'scheduled')
--
-- Bewusst NICHT angefasst:
--   - messages_hunt_member  (SELECT) → Lesen bleibt fuer jeden joined offen
--   - messages_insert_group / messages_select_group (049) → Gruppen-Pfad
--   - 039-Heartbeat-Trigger → unveraendert
--
-- Ausfuehrung: EIN Run im Supabase SQL Editor (BEGIN…COMMIT).
-- Stand: 2026-06-05
-- ============================================================

BEGIN;

-- pg_cron muss aktiv sein (Abschnitt 4+5). Frueh failen statt
-- halb-migriert (Muster aus 040).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION
      'pg_cron extension not enabled. '
      'Activate it: Supabase Dashboard -> Database -> Extensions -> pg_cron';
  END IF;
END $$;

-- ============================================================
-- 1 — Plan-Startzeit + Chat-Freischaltung
--     scheduled_for bewusst NULLABLE statt DEFAULT now(): bestehende
--     active-Jagden + der Sofort-Pfad haben kein Plandatum. Der
--     Create-Branch (Phase I) setzt scheduled_for nur im Zukunfts-Fall.
-- ============================================================

ALTER TABLE public.hunts
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS chat_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hunts.scheduled_for IS
  'Plan-Startzeitpunkt einer geplanten Jagd. NULL = Sofort-Jagd / '
  'Altdaten ohne Plandatum. NICHT started_at (= tatsaechlicher '
  'Go-Live-Anker fuers Tagebuch; bleibt bei scheduled NULL bis zum Flip).';

COMMENT ON COLUMN public.hunts.chat_open IS
  'Jagdleiter schaltet den Chat vor scheduled_for manuell frei. '
  'Wirkt in der messages_insert_member-Policy.';

-- ============================================================
-- 2 — notify_on_rsvp: Push-Verhalten bei Zu-/Absage.
--     Neues CREATE TYPE (kein ADD-VALUE-Footgun — nur ADD VALUE auf
--     BESTEHENDE Typen ist transaktionsgebunden). Nur 'each' ist in
--     Sprint C verdrahtet; 'digest'/'none' = Schema-Vorrat.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notify_on_rsvp') THEN
    CREATE TYPE notify_on_rsvp AS ENUM ('none', 'each', 'digest');
  END IF;
END $$;

ALTER TABLE public.hunts
  ADD COLUMN IF NOT EXISTS notify_on_rsvp notify_on_rsvp NOT NULL DEFAULT 'each';

COMMENT ON COLUMN public.hunts.notify_on_rsvp IS
  'RSVP-Push-Modus an den Jagdleiter. Sprint C verdrahtet nur ''each'' '
  '(Einzel-Push pro Zu-/Absage); ''digest''/''none'' vorbereitet, '
  'noch ohne Code/UI.';

-- ============================================================
-- 3 — Chat-Insert-Policy (hunt-direkter Pfad) erweitern.
--     Diese Policy ist der reale Hunt-Chat-Schreibpfad
--     (messages.hunt_id gesetzt, group_id NULL — Mini-Recon V1/V2).
--     Logik: Jagdleiter immer; andere joined nur wenn chat_open ODER
--     now() >= scheduled_for ODER scheduled_for IS NULL (= aktive
--     Alt-/Sofort-Jagden ohne Plandatum schreiben ungehindert weiter).
--     Reine ID-Subqueries auf SECURITY-DEFINER-Funktionen (048) +
--     hunts-Read (etabliertes Policy-Muster aus 048) -> kein
--     search_path noetig.
--     messages_hunt_member (SELECT) + messages_insert_group bleiben
--     unangetastet.
-- ============================================================

DROP POLICY IF EXISTS "messages_insert_member" ON public.messages;
CREATE POLICY "messages_insert_member" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Jagdleiter dieser Jagd: immer
    hunt_id IN (SELECT public.get_my_joined_hunt_ids_as_leader())
    -- andere joined: nur bei offenem/freigegebenem Chat
    OR hunt_id IN (
      SELECT h.id FROM public.hunts h
      WHERE h.id IN (SELECT public.get_my_joined_hunt_ids())
        AND (
          h.chat_open = true
          OR now() >= h.scheduled_for
          OR h.scheduled_for IS NULL
        )
    )
  );

-- ============================================================
-- 4 — Cron: scheduled -> active beim Erreichen von scheduled_for.
--     Setzt started_at (Go-Live-Anker) + last_activity_at beim Flip,
--     sonst killt der Auto-End-Cron die frisch aktivierte Jagd sofort
--     (last_activity_at waere noch der Create-Zeitpunkt). Jede Minute,
--     reines UPDATE -> kein search_path-Zwang.
--     Idempotent: unschedule-by-name wie 040.
-- ============================================================

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
       AND now() >= scheduled_for
  $job$
);

-- ============================================================
-- 5 — Auto-End-Cron (040) identisch neu schedulen, nur das WHERE um
--     AND status <> 'scheduled' ergaenzt (L3): so stirbt eine geplante
--     Jagd nicht vor dem Go-Live (scheduled hat keine Aktivitaet ->
--     last_activity_at bleibt Create-Zeit -> 12h-Regel wuerde sonst
--     greifen). Sonst byte-fuer-byte wie 040.
-- ============================================================

SELECT cron.unschedule('auto-end-stale-hunts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-end-stale-hunts');

SELECT cron.schedule(
  'auto-end-stale-hunts',
  '*/30 * * * *',
  $job$
    UPDATE hunts
    SET status   = 'auto_completed',
        ended_at = last_activity_at
    WHERE ended_at IS NULL
      AND status <> 'scheduled'
      AND last_activity_at < now() - interval '12 hours'
  $job$
);

COMMIT;
