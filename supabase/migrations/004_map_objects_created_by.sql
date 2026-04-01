-- Migration 004: map_objects erweitern für Hochsitz-Erstellung aus der Karte
-- - created_by Spalte hinzufügen
-- - district_id nullable machen (für Objekte ohne Revier-Zuordnung)
-- - RLS-Policy für Ersteller (eigene Objekte verwalten)

-- 1. created_by Spalte
ALTER TABLE map_objects
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);

-- 2. district_id nullable machen
ALTER TABLE map_objects
  ALTER COLUMN district_id DROP NOT NULL;

-- 3. RLS: Ersteller darf eigene Objekte verwalten (CRUD)
CREATE POLICY "map_objects_creator_manage" ON map_objects
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- 4. RLS: Alle eingeloggten User dürfen Objekte ohne district_id sehen
-- (z.B. Hochsitze die direkt auf der Karte gesetzt wurden)
CREATE POLICY "map_objects_own_no_district" ON map_objects
  FOR SELECT USING (
    district_id IS NULL AND created_by = auth.uid()
  );
