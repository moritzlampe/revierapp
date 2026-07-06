-- 056_hunt_drives.sql
-- Treiben (drives) for Drückjagd: hunt_drives + hunt_drive_stands,
-- kills.drive_id (time-based auto-assignment), participant_role 'treiber',
-- hunt_participants.position_consent, cleanup + backfill triggers, RLS, realtime.
--
-- Design locks (Session 06.07.2026): drive = named stand selection, polygon optional;
-- one active drive per hunt; kill window = started_at - 30 min .. ended_at + 15 min,
-- precedence core > tail > lead; writes creator-only (seat_assignments pattern).
-- Idempotent where possible (lesson from 039).

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.drive_status AS ENUM ('pending', 'active', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public.participant_role ADD VALUE IF NOT EXISTS 'treiber';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hunt_drives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id       uuid NOT NULL REFERENCES public.hunts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  sequence      int  NOT NULL DEFAULT 1,
  status        public.drive_status NOT NULL DEFAULT 'pending',
  polygon       geometry(Polygon, 4326),
  planned_start timestamptz,          -- schema reserve, no UI in MVP
  planned_end   timestamptz,          -- schema reserve, no UI in MVP
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only one active drive per hunt.
CREATE UNIQUE INDEX IF NOT EXISTS hunt_drives_one_active_per_hunt
  ON public.hunt_drives (hunt_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hunt_drives_hunt_id
  ON public.hunt_drives (hunt_id);

-- Stand set per drive. Fixed stands via map_objects, adhoc seats via the
-- hunt_seat_assignments row PK (stable adhoc reference, recon A6).
-- CASCADE (not SET NULL) on both: a vanished stand must remove the link row,
-- otherwise the num_nonnulls check would be violated.
CREATE TABLE IF NOT EXISTS public.hunt_drive_stands (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id           uuid NOT NULL REFERENCES public.hunt_drives(id) ON DELETE CASCADE,
  map_object_id      uuid REFERENCES public.map_objects(id) ON DELETE CASCADE,
  seat_assignment_id uuid REFERENCES public.hunt_seat_assignments(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(map_object_id, seat_assignment_id) = 1),
  UNIQUE (drive_id, map_object_id),
  UNIQUE (drive_id, seat_assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_hunt_drive_stands_map_object
  ON public.hunt_drive_stands (map_object_id);
CREATE INDEX IF NOT EXISTS idx_hunt_drive_stands_seat_assignment
  ON public.hunt_drive_stands (seat_assignment_id);

-- ---------------------------------------------------------------------------
-- 3. Additive columns on existing tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.kills
  ADD COLUMN IF NOT EXISTS drive_id uuid REFERENCES public.hunt_drives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kills_drive_id ON public.kills (drive_id);

-- null = never asked (all existing Schützen), true/false = consent dialog answer.
ALTER TABLE public.hunt_participants
  ADD COLUMN IF NOT EXISTS position_consent boolean;

-- ---------------------------------------------------------------------------
-- 4. Trigger: time-based kill -> drive assignment
--    Window: started_at - 30 min .. ended_at + 15 min (open while active).
--    Precedence: core window (0) > tail (1) > lead (2). Match on erlegt_am,
--    fallback now(). No PostGIS involved -> search_path = public suffices.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_kill_drive_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t timestamptz;
BEGIN
  IF NEW.drive_id IS NOT NULL OR NEW.hunt_id IS NULL THEN
    RETURN NEW;
  END IF;

  t := COALESCE(NEW.erlegt_am, now());

  SELECT d.id INTO NEW.drive_id
  FROM public.hunt_drives d
  WHERE d.hunt_id = NEW.hunt_id
    AND d.started_at IS NOT NULL
    AND t >= d.started_at - interval '30 minutes'
    AND (d.ended_at IS NULL OR t <= d.ended_at + interval '15 minutes')
  ORDER BY
    CASE
      WHEN t >= d.started_at AND (d.ended_at IS NULL OR t <= d.ended_at) THEN 0  -- core
      WHEN d.ended_at IS NOT NULL AND t > d.ended_at                     THEN 1  -- tail
      ELSE 2                                                                     -- lead
    END,
    d.started_at DESC
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kills_set_drive_id ON public.kills;
CREATE TRIGGER trg_kills_set_drive_id
  BEFORE INSERT ON public.kills
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kill_drive_id();

-- ---------------------------------------------------------------------------
-- 5. Trigger: backfill lead-window kills when a drive starts.
--    Covers: kill reported at 10:52, drive 2 started 11:00 -> assigned on start.
--    Idempotent via drive_id IS NULL. App convention: drives are always
--    created as 'pending' and started via UPDATE (trigger is UPDATE-only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.backfill_kills_on_drive_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.kills
     SET drive_id = NEW.id
   WHERE hunt_id = NEW.hunt_id
     AND drive_id IS NULL
     AND COALESCE(erlegt_am, created_at) >= NEW.started_at - interval '30 minutes'
     AND COALESCE(erlegt_am, created_at) <= NEW.started_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drives_backfill_kills ON public.hunt_drives;
CREATE TRIGGER trg_drives_backfill_kills
  AFTER UPDATE OF status ON public.hunt_drives
  FOR EACH ROW
  WHEN (NEW.status = 'active'
        AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.started_at IS NOT NULL)
  EXECUTE FUNCTION public.backfill_kills_on_drive_start();

-- ---------------------------------------------------------------------------
-- 6. Trigger: close active drives when the hunt ends.
--    Fills the gap left by the auto-end cron (040/051), which only touches
--    hunts. 'pending' drives stay pending (never happened).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_drives_on_hunt_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hunt_drives
     SET status = 'completed',
         ended_at = COALESCE(ended_at, now())
   WHERE hunt_id = NEW.id
     AND status = 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hunts_close_drives ON public.hunts;
CREATE TRIGGER trg_hunts_close_drives
  AFTER UPDATE OF status ON public.hunts
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'auto_completed')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.close_drives_on_hunt_end();

-- ---------------------------------------------------------------------------
-- 7. RLS (patterns from hunt_seat_assignments: participant SELECT via
--    get_my_joined_hunt_ids(), writes via hunts.creator_id)
-- ---------------------------------------------------------------------------

ALTER TABLE public.hunt_drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunt_drive_stands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hunt_drives_participant_select ON public.hunt_drives;
CREATE POLICY hunt_drives_participant_select ON public.hunt_drives
  FOR SELECT
  USING (hunt_id IN (SELECT get_my_joined_hunt_ids()));

DROP POLICY IF EXISTS hunt_drives_creator_insert ON public.hunt_drives;
CREATE POLICY hunt_drives_creator_insert ON public.hunt_drives
  FOR INSERT
  WITH CHECK (hunt_id IN (SELECT id FROM public.hunts WHERE creator_id = auth.uid()));

DROP POLICY IF EXISTS hunt_drives_creator_update ON public.hunt_drives;
CREATE POLICY hunt_drives_creator_update ON public.hunt_drives
  FOR UPDATE
  USING (hunt_id IN (SELECT id FROM public.hunts WHERE creator_id = auth.uid()));

DROP POLICY IF EXISTS hunt_drives_creator_delete ON public.hunt_drives;
CREATE POLICY hunt_drives_creator_delete ON public.hunt_drives
  FOR DELETE
  USING (hunt_id IN (SELECT id FROM public.hunts WHERE creator_id = auth.uid()));

DROP POLICY IF EXISTS drive_stands_participant_select ON public.hunt_drive_stands;
CREATE POLICY drive_stands_participant_select ON public.hunt_drive_stands
  FOR SELECT
  USING (drive_id IN (
    SELECT d.id FROM public.hunt_drives d
    WHERE d.hunt_id IN (SELECT get_my_joined_hunt_ids())
  ));

DROP POLICY IF EXISTS drive_stands_creator_insert ON public.hunt_drive_stands;
CREATE POLICY drive_stands_creator_insert ON public.hunt_drive_stands
  FOR INSERT
  WITH CHECK (drive_id IN (
    SELECT d.id FROM public.hunt_drives d
    JOIN public.hunts h ON h.id = d.hunt_id
    WHERE h.creator_id = auth.uid()
  ));

DROP POLICY IF EXISTS drive_stands_creator_update ON public.hunt_drive_stands;
CREATE POLICY drive_stands_creator_update ON public.hunt_drive_stands
  FOR UPDATE
  USING (drive_id IN (
    SELECT d.id FROM public.hunt_drives d
    JOIN public.hunts h ON h.id = d.hunt_id
    WHERE h.creator_id = auth.uid()
  ));

DROP POLICY IF EXISTS drive_stands_creator_delete ON public.hunt_drive_stands;
CREATE POLICY drive_stands_creator_delete ON public.hunt_drive_stands
  FOR DELETE
  USING (drive_id IN (
    SELECT d.id FROM public.hunt_drives d
    JOIN public.hunts h ON h.id = d.hunt_id
    WHERE h.creator_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- 8. Grants + realtime
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hunt_drives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hunt_drive_stands TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hunt_drives;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
