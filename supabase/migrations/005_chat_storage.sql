-- ============================================================
-- Chat-Fotos: Storage Bucket + Policies
-- ============================================================

-- Bucket fuer Chat-Fotos (public fuer einfachen Zugriff, URLs nicht erratbar)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-photos', 'chat-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Authentifizierte User koennen hochladen
CREATE POLICY "chat_photos_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-photos');

-- Jeder kann lesen (public bucket)
CREATE POLICY "chat_photos_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-photos');
