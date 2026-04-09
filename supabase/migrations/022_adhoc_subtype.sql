-- Optional sub-type for adhoc seats: ladder / hochstand / stool
-- UI for selecting this comes later (Prompt 52). Default NULL means
-- "generic adhoc" and renders with the existing crosshair icon.
ALTER TABLE hunt_seat_assignments
  ADD COLUMN adhoc_subtype TEXT
    CHECK (adhoc_subtype IN ('leiter', 'hochsitz', 'sitzstock'));

COMMENT ON COLUMN hunt_seat_assignments.adhoc_subtype IS
  'Visual sub-type for adhoc seats. NULL = generic crosshair. Has no
   functional impact, only marker icon selection.';
