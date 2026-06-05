-- ============================================================
-- Migration 048: Sichtbarkeit invited vs. joined (Sprint A)
-- ------------------------------------------------------------
-- Ziel: "Erst zusagen, dann reinsehen." Vor status='joined' sieht
--       ein Teilnehmer NUR die Einladung (hunts-Zeile + eigene
--       hunt_participants-Zeile) — NICHT Mitschützen, Strecke,
--       Live-Positionen, Karte, Fotos, Standzuweisungen.
--
-- Quelle: Sprint-A-Brief + Recon-Inventar + §7-Live-Verifikation
--         (pg_policies/pg_proc, 2026-06-04).
--
-- Bewusst NICHT angefasst:
--   - hunts_participant_select        → G2: Einladung muss sichtbar
--   - messages_select_group           → Chat-Zweitpfad (Sprint B)
--   - profiles_select_chat_members    → Chat-Zweitpfad (Sprint B)
--   Residual: invited liest Hunt-Chat + Chat-Mitglieder-Profile
--   noch über chat_group_members, bis Sprint B den create/accept-
--   Flow fixt. Dokumentiert, akzeptiert.
--
-- Ausführung: EIN Run im Supabase SQL Editor (BEGIN…COMMIT).
-- Stand: 2026-06-04
-- ============================================================

BEGIN;

-- ============================================================
-- A — joined-gefilterte SECURITY-DEFINER-Funktionen
--     (analog get_my_hunt_ids* aus 027, zusätzlich status='joined')
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_joined_hunt_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT hunt_id FROM hunt_participants
  WHERE user_id = auth.uid() AND status = 'joined';
$$;

CREATE OR REPLACE FUNCTION public.get_my_joined_hunt_ids_as_leader()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT hunt_id FROM hunt_participants
  WHERE user_id = auth.uid() AND status = 'joined'
    AND role = 'jagdleiter';
$$;

CREATE OR REPLACE FUNCTION public.get_my_joined_hunt_ids_as_leader_or_groupleader()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT hunt_id FROM hunt_participants
  WHERE user_id = auth.uid() AND status = 'joined'
    AND (role = 'jagdleiter' OR 'gruppenleiter' = ANY(tags));
$$;

-- ============================================================
-- B — hunt_participants: Zwei-Policy-Schnitt (G3)
--     (a) eigene Zeile IMMER  (b) alle Teilnehmer ab joined
--     participants_creator_all bleibt unangetastet.
-- ============================================================

DROP POLICY IF EXISTS "participants_hunt_member" ON hunt_participants;

-- (a) eigene Zeile: deckt invited-Einladungsanzeige UND hält die
--     Inline-Subquery von hunts_participant_select am Leben.
CREATE POLICY "participants_own_row" ON hunt_participants FOR SELECT
  USING (user_id = auth.uid());

-- (b) alle Teilnehmer der Jagd erst ab joined sichtbar.
CREATE POLICY "participants_hunt_member" ON hunt_participants FOR SELECT
  USING (hunt_id IN (SELECT public.get_my_joined_hunt_ids()));

-- ============================================================
-- C — SELECT-Policies auf joined umstellen
-- ============================================================

-- positions (Live-GPS History) — PRIVACY
DROP POLICY IF EXISTS "positions_hunt_member" ON positions;
CREATE POLICY "positions_hunt_member" ON positions FOR SELECT
  USING (hunt_id IN (SELECT public.get_my_joined_hunt_ids()));

-- positions_current (Live-GPS aktuell) — PRIVACY
DROP POLICY IF EXISTS "positions_current_hunt_member" ON positions_current;
CREATE POLICY "positions_current_hunt_member" ON positions_current FOR SELECT
  USING (hunt_id IN (SELECT public.get_my_joined_hunt_ids()));

-- messages (hunt-direkt; Chat-Gruppen-Pfad messages_select_group bleibt)
DROP POLICY IF EXISTS "messages_hunt_member" ON messages;
CREATE POLICY "messages_hunt_member" ON messages FOR SELECT
  USING (hunt_id IN (SELECT public.get_my_joined_hunt_ids()));

-- map_objects (District-Join-Variante: innere Funktion ersetzt)
DROP POLICY IF EXISTS "map_objects_hunt_member" ON map_objects;
CREATE POLICY "map_objects_hunt_member" ON map_objects FOR SELECT
  USING (
    district_id IN (
      SELECT h.district_id FROM hunts h
      WHERE h.id IN (SELECT public.get_my_joined_hunt_ids())
        AND h.district_id IS NOT NULL
    )
  );

-- profiles (Mit-Jäger; innere Funktion ersetzt)
-- profiles_select_own + profiles_select_chat_members bleiben unangetastet.
DROP POLICY IF EXISTS "profiles_select_co_hunters" ON profiles;
CREATE POLICY "profiles_select_co_hunters" ON profiles FOR SELECT
  USING (
    id IN (
      SELECT hp.user_id FROM hunt_participants hp
      WHERE hp.hunt_id IN (SELECT public.get_my_joined_hunt_ids())
    )
  );

-- hunt_seat_assignments (roles=authenticated BEIBEHALTEN!)
DROP POLICY IF EXISTS "seat_assignments_participant_select" ON hunt_seat_assignments;
CREATE POLICY "seat_assignments_participant_select" ON hunt_seat_assignments FOR SELECT
  TO authenticated
  USING (hunt_id IN (SELECT public.get_my_joined_hunt_ids()));

-- hunt_photos (Teilnehmer-Teil auf joined; Creator-OR-Klausel bleibt)
DROP POLICY IF EXISTS "hunt_photos_select" ON hunt_photos;
CREATE POLICY "hunt_photos_select" ON hunt_photos FOR SELECT
  USING (
    hunt_id IN (SELECT public.get_my_joined_hunt_ids())
    OR hunt_id IN (SELECT id FROM hunts WHERE creator_id = auth.uid())
  );

-- ============================================================
-- D — kills: alle 3 Visibility-Policies auf joined-Funktionen
-- ============================================================

DROP POLICY IF EXISTS "kills_visibility_all" ON kills;
CREATE POLICY "kills_visibility_all" ON kills FOR SELECT USING (
  hunt_id IN (SELECT public.get_my_joined_hunt_ids())
  AND (SELECT kill_visibility FROM hunts WHERE id = kills.hunt_id) = 'all'
);

DROP POLICY IF EXISTS "kills_visibility_leader" ON kills;
CREATE POLICY "kills_visibility_leader" ON kills FOR SELECT USING (
  hunt_id IN (SELECT public.get_my_joined_hunt_ids_as_leader())
  AND (SELECT kill_visibility FROM hunts WHERE id = kills.hunt_id) = 'leader_only'
);

DROP POLICY IF EXISTS "kills_visibility_leader_groupleader" ON kills;
CREATE POLICY "kills_visibility_leader_groupleader" ON kills FOR SELECT USING (
  hunt_id IN (SELECT public.get_my_joined_hunt_ids_as_leader_or_groupleader())
  AND (SELECT kill_visibility FROM hunts WHERE id = kills.hunt_id) = 'leader_and_groupleader'
);

-- ============================================================
-- E — WRITE-Policies auf joined (E3: invited darf nichts in die
--     Jagd schreiben, auch keine eigene Position broadcasten)
-- ============================================================

-- messages INSERT (hunt-direkt; Chat-Insert messages_insert_group bleibt)
DROP POLICY IF EXISTS "messages_insert_member" ON messages;
CREATE POLICY "messages_insert_member" ON messages FOR INSERT
  WITH CHECK (hunt_id IN (SELECT public.get_my_joined_hunt_ids()));

-- positions INSERT (eigene participant-Zeile, jetzt nur ab joined)
DROP POLICY IF EXISTS "positions_insert_own" ON positions;
CREATE POLICY "positions_insert_own" ON positions FOR INSERT
  WITH CHECK (
    participant_id IN (
      SELECT id FROM hunt_participants
      WHERE user_id = auth.uid() AND status = 'joined'
    )
  );

-- positions_current UPSERT (FOR ALL; USING dient auch als WITH CHECK)
DROP POLICY IF EXISTS "positions_current_upsert_own" ON positions_current;
CREATE POLICY "positions_current_upsert_own" ON positions_current FOR ALL
  USING (
    participant_id IN (
      SELECT id FROM hunt_participants
      WHERE user_id = auth.uid() AND status = 'joined'
    )
  );

COMMIT;
