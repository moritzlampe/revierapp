-- ============================================================
-- App-Photos: Allgemeiner Storage Bucket fuer Revier-Objekte,
-- Strecke, Nachsuche, Wildmarken, Wartung etc.
--
-- Pfad-Konvention: {userId}/{entityType}/{entityId}/{uuid}.jpg
--   Beispiel: 3fa85f64.../map_object/9b1deb4d.../a1b2c3d4.jpg
--
-- Erste Ordner-Ebene = userId → RLS prueft auth.uid() dagegen.
-- ============================================================

-- Bucket anlegen (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-photos',
  'app-photos',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS-Policies
-- ============================================================

-- SELECT: Alle authentifizierten User koennen lesen
DROP POLICY IF EXISTS "app_photos_read" ON storage.objects;
CREATE POLICY "app_photos_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'app-photos');

-- INSERT: Nur in eigenen Pfad (erste Ordner-Ebene = userId)
DROP POLICY IF EXISTS "app_photos_insert" ON storage.objects;
CREATE POLICY "app_photos_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'app-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- UPDATE: Nur eigene Dateien
DROP POLICY IF EXISTS "app_photos_update" ON storage.objects;
CREATE POLICY "app_photos_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'app-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- DELETE: Nur eigene Dateien
DROP POLICY IF EXISTS "app_photos_delete" ON storage.objects;
CREATE POLICY "app_photos_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'app-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
