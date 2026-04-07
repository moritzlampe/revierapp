-- ============================================================
-- Migration 014: Ad-hoc Stände für Freie Jagd
-- Bei "Freie Jagd" kann der Jagdleiter temporäre Stände
-- anlegen (z.B. "Eiche am Feldrand", "Mais 1").
-- Stand: 07.04.2026
-- ============================================================

-- Neues Feld für Ad-hoc Standname
ALTER TABLE hunt_seat_assignments ADD COLUMN IF NOT EXISTS seat_name TEXT;

-- Constraint erweitern: 'adhoc' als neuen seat_type erlauben
ALTER TABLE hunt_seat_assignments DROP CONSTRAINT IF EXISTS hunt_seat_assignments_seat_type_check;
ALTER TABLE hunt_seat_assignments ADD CONSTRAINT hunt_seat_assignments_seat_type_check
  CHECK (seat_type IN ('assigned', 'free', 'adhoc'));
