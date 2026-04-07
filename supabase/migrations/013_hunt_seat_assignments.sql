-- ============================================================
-- Migration 013: Hochsitz-Zuweisung pro Jagd
-- Jeder Teilnehmer kann einem Hochsitz/Kanzel/Drückjagdstand
-- zugewiesen werden (oder "Freier Stand" / "Nicht zugewiesen").
-- Stand: 07.04.2026
-- ============================================================

CREATE TABLE IF NOT EXISTS hunt_seat_assignments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hunt_id    UUID REFERENCES hunts(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES profiles(id) NOT NULL,
  seat_id    UUID REFERENCES map_objects(id),          -- NULL = Freier Stand
  seat_type  TEXT NOT NULL DEFAULT 'assigned'           -- 'assigned' oder 'free'
             CHECK (seat_type IN ('assigned', 'free')),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(hunt_id, user_id),   -- Ein User pro Jagd nur eine Zuweisung
  UNIQUE(hunt_id, seat_id)    -- Ein Hochsitz pro Jagd nur einem User (NULL erlaubt mehrfach)
);

-- === RLS ===
ALTER TABLE hunt_seat_assignments ENABLE ROW LEVEL SECURITY;

-- Jagd-Teilnehmer können Zuweisungen sehen
CREATE POLICY "seat_assignments_participant_select"
ON hunt_seat_assignments FOR SELECT
TO authenticated
USING (
  hunt_id IN (SELECT hunt_id FROM hunt_participants WHERE user_id = auth.uid())
);

-- Jagd-Ersteller kann Zuweisungen erstellen
CREATE POLICY "seat_assignments_creator_insert"
ON hunt_seat_assignments FOR INSERT
TO authenticated
WITH CHECK (
  hunt_id IN (SELECT id FROM hunts WHERE creator_id = auth.uid())
);

-- Jagd-Ersteller kann Zuweisungen ändern
CREATE POLICY "seat_assignments_creator_update"
ON hunt_seat_assignments FOR UPDATE
TO authenticated
USING (
  hunt_id IN (SELECT id FROM hunts WHERE creator_id = auth.uid())
);

-- Jagd-Ersteller kann Zuweisungen löschen
CREATE POLICY "seat_assignments_creator_delete"
ON hunt_seat_assignments FOR DELETE
TO authenticated
USING (
  hunt_id IN (SELECT id FROM hunts WHERE creator_id = auth.uid())
);
