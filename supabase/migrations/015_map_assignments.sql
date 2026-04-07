-- ============================================================
-- Migration 015: Karten-basierte Stand-Zuweisung
-- Teilnehmer können auf der Karte platziert werden:
-- - 'assigned' = fester Hochsitz aus Revier (seat_id gesetzt)
-- - 'adhoc'    = ad-hoc Hochsitz dieser Jagd (seat_name + position)
-- - 'free_pos' = freie Position ohne Hochsitz (nur position)
-- Stand: 07.04.2026
-- ============================================================

-- Positions-Felder für Karten-Platzierung
ALTER TABLE hunt_seat_assignments
  ADD COLUMN IF NOT EXISTS position_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS position_lng DOUBLE PRECISION;

-- seat_type Constraint erweitern: 'free_pos' hinzufügen
ALTER TABLE hunt_seat_assignments DROP CONSTRAINT IF EXISTS hunt_seat_assignments_seat_type_check;
ALTER TABLE hunt_seat_assignments ADD CONSTRAINT hunt_seat_assignments_seat_type_check
  CHECK (seat_type IN ('assigned', 'free', 'adhoc', 'free_pos'));
