-- Migration 026: Ephemere Grenze für freie Jagden (ohne verknüpftes Revier)
-- Bei Jagd mit Revier wird districts.boundary verwendet.

ALTER TABLE hunts
  ADD COLUMN boundary geography(Polygon, 4326);

COMMENT ON COLUMN hunts.boundary IS
  'Ephemere Grenze für freie Jagden (district_id IS NULL).
   Bei verknüpftem Revier wird districts.boundary verwendet.';
