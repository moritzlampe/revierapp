-- Gruppen-Avatar
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage Bucket für Gruppen-Avatare
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-avatars', 'group-avatars', true)
ON CONFLICT DO NOTHING;

-- Storage Policies
CREATE POLICY "Group creators can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM chat_groups WHERE created_by = auth.uid()
  )
);

CREATE POLICY "Anyone can view group avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'group-avatars');

CREATE POLICY "Group creators can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM chat_groups WHERE created_by = auth.uid()
  )
);

CREATE POLICY "Group creators can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'group-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM chat_groups WHERE created_by = auth.uid()
  )
);
