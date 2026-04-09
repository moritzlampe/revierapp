-- ============================================================
-- Migration 021: Unbesetzte Adhoc-Stände erlauben
-- user_id darf NULL sein = Platzhalter-Stand ohne Schütze.
-- Stand: 09.04.2026
-- ============================================================

-- Unbesetzte Stände erlauben (Platzhalter ohne Jäger)
ALTER TABLE hunt_seat_assignments
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN hunt_seat_assignments.user_id IS
  'Assigned hunter. NULL = placeholder seat without assigned shooter.';
