-- 061_drive_assignments.sql
--
-- Per-Treiben-Schützenverteilung: who stands where, per drive.
--
-- Until now a hunt had exactly one seating plan (hunt_seat_assignments), while
-- a Drückjagd re-seats the whole party between Treiben. 056 gave each drive its
-- stand SET (hunt_drive_stands); this gives each of those stands its SHOOTER.
--
-- Design locks (session 13.07.2026):
--   D1  No new table — one nullable column on hunt_drive_stands. The stand row
--       already IS the (drive, stand) tuple; the assignment is one more fact
--       about it. ON DELETE SET NULL so a participant leaving the hunt clears
--       his assignment without removing the stand from the drive.
--   D2  Keyed by participant_id, not user_id: guests have no user_id, and
--       hunt_seat_assignments' user_id keying is the thing we are not repeating.
--   D5  No realtime, no publication change. hunt_drive_stands was never in
--       supabase_realtime (056:§8) — the client already refetches the whole
--       drive list on every hunt_drives event, and an assignment is only ever
--       written by the Jagdleiter while nothing else is happening.
--
-- No policy change on purpose: the four hunt_drive_stands policies from 056 are
-- column-agnostic (SELECT for joined participants, INSERT/UPDATE/DELETE for the
-- hunt creator). Creator-only writes are exactly the V1 rule — the Jagdleiter
-- seats the party, nobody else.
--
-- Idempotent. Apply in ONE selection in the Supabase SQL editor.
--
-- NOTE: canonical migration history lives in revierapp/supabase/migrations —
-- mirror this file over (see the same note in 059).

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE public.hunt_drive_stands
  ADD COLUMN IF NOT EXISTS participant_id uuid
    REFERENCES public.hunt_participants(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. One stand per shooter per drive
-- ---------------------------------------------------------------------------
--
-- Partial, because NULL means "unassigned" and any number of stands in a drive
-- may be unassigned. The plain UNIQUE (drive_id, participant_id) would allow
-- that too (NULLs are distinct), but the partial index keeps the unassigned
-- rows out of the index entirely — and states the intent.
--
-- The client's "move a shooter" path (old row → NULL, then new row → id) is
-- sequential precisely because of this constraint.

CREATE UNIQUE INDEX IF NOT EXISTS hunt_drive_stands_drive_participant_key
  ON public.hunt_drive_stands (drive_id, participant_id)
  WHERE participant_id IS NOT NULL;

-- ponytail: no separate index on participant_id alone. Nothing reads by it —
-- the resolver works on drive rows already fetched with the drive. The only
-- participant_id-only access is the ON DELETE SET NULL scan when someone leaves
-- a hunt, on a table holding a handful of rows per hunt. Add one when a
-- "which drives is X seated in?" query appears.
