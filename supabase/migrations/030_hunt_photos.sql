-- ============================================================
-- Migration 030: hunt_photos Tabelle für Hunt-level Fotos
-- Feature: Foto-Erfassung im Erlegung-Flow (Sprint 58.1g.1a)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS hunt_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  kill_ids UUID[] NULL,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taken_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hunt_photos_hunt_id
  ON hunt_photos(hunt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunt_photos_uploaded_by
  ON hunt_photos(uploaded_by);

-- GIN-Index für schnelle Array-Lookups (z.B. "welche Fotos zeigen Kill X?")
CREATE INDEX IF NOT EXISTS idx_hunt_photos_kill_ids
  ON hunt_photos USING GIN (kill_ids);

-- RLS
ALTER TABLE hunt_photos ENABLE ROW LEVEL SECURITY;

-- SELECT: Hunt-Teilnehmer oder Creator
DROP POLICY IF EXISTS "hunt_photos_select" ON hunt_photos;
CREATE POLICY "hunt_photos_select" ON hunt_photos FOR SELECT USING (
  hunt_id IN (SELECT hunt_id FROM hunt_participants WHERE user_id = auth.uid())
  OR hunt_id IN (SELECT id FROM hunts WHERE creator_id = auth.uid())
);

-- INSERT: Nur aktive Teilnehmer, uploaded_by muss auth.uid() sein
DROP POLICY IF EXISTS "hunt_photos_insert" ON hunt_photos;
CREATE POLICY "hunt_photos_insert" ON hunt_photos FOR INSERT WITH CHECK (
  uploaded_by = auth.uid()
  AND hunt_id IN (
    SELECT hunt_id FROM hunt_participants
    WHERE user_id = auth.uid() AND status = 'joined'
  )
);

-- DELETE: Uploader oder Jagdleiter der Hunt
DROP POLICY IF EXISTS "hunt_photos_delete" ON hunt_photos;
CREATE POLICY "hunt_photos_delete" ON hunt_photos FOR DELETE USING (
  uploaded_by = auth.uid()
  OR hunt_id IN (
    SELECT hunt_id FROM hunt_participants
    WHERE user_id = auth.uid() AND role = 'jagdleiter'
  )
);

COMMIT;
