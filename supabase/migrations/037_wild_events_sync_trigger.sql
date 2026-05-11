-- 037_wild_events_sync_trigger.sql
-- Trigger-basierte Spiegelung kills -> wild_events (Mini-Sprint Datenintegritaet)
-- Referenz: 036_tagebuch_foundation.sql Sektion B (einmaliger Bestands-Backfill)
-- Stand: 2026-05-11
--
-- Rollback bei Bedarf:
--   DROP TRIGGER IF EXISTS trg_kills_sync_wild_event ON kills;
--   DROP FUNCTION IF EXISTS sync_wild_event_for_kill();
--
-- Hintergrund:
--   036 hat fuer den damaligen kills-Bestand wild_events-Rows angelegt und
--   kills.wild_event_id verknuepft. Es gab aber keinen Mechanismus, der neue
--   Inserts ab dem Apply-Datum weiterhin spiegelt. Folge: getDiaryStats.
--   erlegungen (zaehlt aus wild_events) sieht alle neuen Kills nicht.
--
-- Sektionen:
--   A - Trigger-Funktion sync_wild_event_for_kill()
--   B - Trigger trg_kills_sync_wild_event auf kills (AFTER INSERT/UPDATE/DELETE)
--   C - Idempotenter Backfill (analog 036:81-124, voraussichtlich 0 Rows)
--   D - Post-Check
--
-- Trigger-Semantik:
--   INSERT                        -> wild_events Row anlegen + wild_event_id zurueckschreiben
--   UPDATE wild_event_id IS NULL  -> analog INSERT (deckt nachtraegliche manuelle Inserts ab)
--   UPDATE wild_event_id NOT NULL -> spiegelbare Felder syncen (hunt_id, species, occurred_at, location)
--   DELETE                        -> zugehoerige wild_events Row mitloeschen (kein Orphan)
--
-- Rekursions-Sicherheit:
--   Der INSERT-Branch schreibt wild_event_id per UPDATE zurueck auf kills.
--   Das feuert den Trigger erneut. Zweiter Durchlauf hat NEW.wild_event_id
--   IS NOT NULL und landet im Sync-Branch. Diff-Check vergleicht spiegelbare
--   Felder mit OLD - sind unveraendert (nur wild_event_id hat sich geaendert),
--   also kein wild_events-UPDATE. Rekursion bricht nach zwei Durchlaeufen.
--
-- RLS:
--   wild_events hat owner-only-Policy (036:62-66). Der Trigger laeuft mit
--   SECURITY DEFINER und umgeht damit RLS. user_id wird explizit aus
--   NEW.reporter_id gesetzt (nicht aus auth.uid()), so dass kein
--   Owner-Mismatch entstehen kann.
--
-- Hinweis fuer spaetere Migrationen:
--   Wenn weitere kills-Felder spiegelbar werden sollen (z.B. neue Geometry-
--   Quelle), Diff-Check und UPDATE-Statement im Sync-Branch erweitern. Andere
--   Spalten (notiz, kapital, weather_snapshot, distance_m) bleiben bewusst
--   kill-lokal.

BEGIN;

-- ============================================================
-- A - Trigger-Funktion
-- ============================================================

CREATE OR REPLACE FUNCTION sync_wild_event_for_kill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_event_id uuid;
BEGIN
  -- DELETE: Orphan vermeiden
  IF TG_OP = 'DELETE' THEN
    IF OLD.wild_event_id IS NOT NULL THEN
      DELETE FROM wild_events WHERE id = OLD.wild_event_id;
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT oder UPDATE-ohne-Mapping: wild_events Row anlegen + verknuepfen
  IF NEW.wild_event_id IS NULL THEN
    INSERT INTO wild_events
      (user_id, hunt_id, type, species, occurred_at, location, created_at)
    VALUES (
      NEW.reporter_id,
      NEW.hunt_id,
      'kill'::wild_event_type,
      NEW.wild_art::text,
      COALESCE(NEW.erlegt_am, NEW.created_at),
      NEW.position::geography,
      NEW.created_at
    )
    RETURNING id INTO new_event_id;

    UPDATE kills SET wild_event_id = new_event_id WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- UPDATE mit bestehendem Mapping: spiegelbare Felder synchronisieren,
  -- nur wenn tatsaechlich relevant geaendert (Diff-Check verhindert
  -- unnoetige Writes und ist Teil der Rekursionsbremse)
  IF TG_OP = 'UPDATE' AND (
       NEW.hunt_id     IS DISTINCT FROM OLD.hunt_id
    OR NEW.wild_art    IS DISTINCT FROM OLD.wild_art
    OR COALESCE(NEW.erlegt_am, NEW.created_at)
         IS DISTINCT FROM COALESCE(OLD.erlegt_am, OLD.created_at)
    OR NEW.position    IS DISTINCT FROM OLD.position
  ) THEN
    UPDATE wild_events SET
      hunt_id     = NEW.hunt_id,
      species     = NEW.wild_art::text,
      occurred_at = COALESCE(NEW.erlegt_am, NEW.created_at),
      location    = NEW.position::geography
    WHERE id = NEW.wild_event_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_wild_event_for_kill IS
  'Spiegelt INSERT/UPDATE/DELETE auf kills zur wild_events-Tabelle. Haelt die erlegungen-Stats im Jagdtagebuch konsistent mit der Streckenliste. SECURITY DEFINER - umgeht wild_events-RLS, user_id wird explizit aus reporter_id gesetzt.';

-- ============================================================
-- B - Trigger
-- ============================================================

DROP TRIGGER IF EXISTS trg_kills_sync_wild_event ON kills;

CREATE TRIGGER trg_kills_sync_wild_event
  AFTER INSERT OR UPDATE OR DELETE ON kills
  FOR EACH ROW
  EXECUTE FUNCTION sync_wild_event_for_kill();

-- ============================================================
-- C - Idempotenter Backfill (analog 036:81-124)
-- ============================================================
-- Erwartet 0 Rows, weil die DB aktuell nur Testdaten enthaelt und 036 den
-- damaligen Bestand bereits gemappt hat. Block ist trotzdem vorhanden, falls
-- zwischen 036 und 037 doch Kills via insertKillBatch entstanden sind.

DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT reporter_id, COALESCE(erlegt_am, created_at) AS ts
    FROM kills
    WHERE wild_event_id IS NULL
    GROUP BY reporter_id, COALESCE(erlegt_am, created_at)
    HAVING COUNT(*) > 1
  ) sub;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Backfill abgebrochen: % Reporter+Zeitstempel-Kollisionen in kills. '
      'Sektion C muss auf Cursor-Loop-Variante umgestellt werden, bevor 037 erneut laeuft.',
      duplicate_count;
  END IF;
END $$;

WITH inserted AS (
  INSERT INTO wild_events
    (user_id, hunt_id, type, species, occurred_at, location, created_at)
  SELECT
    reporter_id,
    hunt_id,
    'kill'::wild_event_type,
    wild_art::text,
    COALESCE(erlegt_am, created_at),
    position::geography,
    created_at
  FROM kills
  WHERE wild_event_id IS NULL
  RETURNING id, user_id, occurred_at
)
UPDATE kills k
SET wild_event_id = i.id
FROM inserted i
WHERE k.reporter_id = i.user_id
  AND COALESCE(k.erlegt_am, k.created_at) = i.occurred_at
  AND k.wild_event_id IS NULL;

-- ============================================================
-- D - Post-Check
-- ============================================================

DO $$
DECLARE
  unmapped_count integer;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM kills WHERE wild_event_id IS NULL;
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION
      'Migration 037 unvollstaendig: % kills ohne wild_event_id. Wird zurueckgerollt.',
      unmapped_count;
  END IF;
END $$;

COMMIT;
