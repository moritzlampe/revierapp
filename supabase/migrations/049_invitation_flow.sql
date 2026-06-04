-- ============================================================
-- Migration 049: Einladungs-Flow (Sprint B)
-- ------------------------------------------------------------
-- Schließt das Sprint-A-Residual an der Wurzel: invited-User
-- kommen nicht mehr per Chat-Zweitpfad an Hunt-Chat + Profile.
-- Hier liegt nur das Backend, von dem die Sprint-A-Policies lesen;
-- die RLS-Policies aus 048 bleiben unangetastet.
--
-- Inhalt:
--   1) RPC accept_hunt_invitation  — invited -> joined + Chat-Eintrag
--   2) RPC decline_hunt_invitation — eigene invited-Zeile löschen
--   3) RPC get_my_invitations      — Einladungsliste inkl. Ersteller-Name
--   4) messages_select_group/_insert_group härten (group_id IS NULL raus)
--   5) Einmal-Cleanup: nicht-joined User aus HUNT-Chat-Gruppen entfernen
--   + GRANT EXECUTE an authenticated
--
-- Verify-Guard (vor SQL, bestätigt): Hunt-Chat sendet/liest hunt-direkt
--   (messages.hunt_id, group_id NULL) über messages_insert_member /
--   messages_hunt_member (joined, Sprint A). Kein legitimer Pfad hängt
--   an messages_*_group's "group_id IS NULL". Entfernen ist sicher.
--
-- Ausführung: EIN Run im Supabase SQL Editor (BEGIN…COMMIT).
-- Stand: 2026-06-04
-- ============================================================

BEGIN;

-- ============================================================
-- 1 — accept_hunt_invitation: invited -> joined (+joined_at) und
--     idempotenter Eintrag in die Hunt-Chat-Gruppe.
--     SECURITY DEFINER, weil (a) hunt_participants keine
--     "update own row"-Policy hat und (b) chat_group_members nur
--     den Gruppen-Ersteller einfügen lässt. Operiert ausschließlich
--     auf der EIGENEN Zeile (user_id = auth.uid()) und nur wenn
--     aktuell invited — keine Role-/Status-Escalation möglich.
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_hunt_invitation(p_hunt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- invited -> joined (nur eigene Zeile, nur wenn aktuell invited)
  UPDATE hunt_participants
     SET status = 'joined', joined_at = now()
   WHERE hunt_id = p_hunt_id
     AND user_id = v_uid
     AND status = 'invited';

  -- In die Hunt-Chat-Gruppe eintragen (idempotent via UNIQUE(group_id,user_id)).
  -- EXISTS-Guard koppelt den INSERT an "User ist JETZT joined in dieser Jagd":
  -- nur legitime Annahme (war invited) oder Altdaten-Repair (war schon joined)
  -- führt zum Eintrag. Wer nie eingeladen war, ist nicht joined → kein INSERT
  -- (sonst könnte jeder authenticated User sich in jede Hunt-Chat-Gruppe schreiben).
  INSERT INTO chat_group_members (group_id, user_id)
  SELECT cg.id, v_uid
    FROM chat_groups cg
   WHERE cg.hunt_id = p_hunt_id
     AND EXISTS (
       SELECT 1 FROM hunt_participants hp
       WHERE hp.hunt_id = p_hunt_id
         AND hp.user_id = v_uid
         AND hp.status  = 'joined'
     )
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;

-- ============================================================
-- 2 — decline_hunt_invitation: eigene invited-Zeile löschen.
--     KEIN chat_group_members-Eintrag. Kein 'declined'-Status
--     (Enum hat ihn nicht; Löschen hält die Jagd re-einladbar).
--     Schützt joined-Mitgliedschaften (status='invited'-Guard).
-- ============================================================

CREATE OR REPLACE FUNCTION public.decline_hunt_invitation(p_hunt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM hunt_participants
   WHERE hunt_id = p_hunt_id
     AND user_id = v_uid
     AND status = 'invited';
END;
$$;

-- ============================================================
-- 3 — get_my_invitations: Einladungsliste in einem Round-Trip,
--     inkl. Ersteller-Name + Revier-Name. SECURITY DEFINER, damit
--     der Ersteller-Name OHNE Loch in der profiles-RLS (048) kommt.
--     Liefert nur eigene invited-Zeilen aktiver Jagden.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_invitations()
RETURNS TABLE (
  hunt_id       uuid,
  name          text,
  type          text,
  kind          text,
  started_at    timestamptz,
  district_name text,
  creator_name  text,
  invited_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    h.id,
    h.name,
    h.type::text,
    h.kind::text,
    h.started_at,
    d.name,
    cp.display_name,
    hp.created_at
  FROM hunt_participants hp
  JOIN hunts h        ON h.id = hp.hunt_id
  LEFT JOIN districts d ON d.id = h.district_id
  LEFT JOIN profiles cp ON cp.id = h.creator_id
  WHERE hp.user_id = auth.uid()
    AND hp.status = 'invited'
    -- nur nicht-beendete Jagden (deckt 'active' UND 'paused' ab; konsistent
    -- mit isHuntEnded() aus src/lib/hunt/status.ts). Text-Cast vermeidet
    -- Enum-Cast-Fehler und das Silent-Empty-Risiko eines falschen ='active'.
    AND h.status::text NOT IN ('completed', 'auto_completed')
  ORDER BY hp.created_at DESC;
$$;

-- ============================================================
-- 4 — messages_*_group härten: "group_id IS NULL OR …" entfernen.
--     hunt-direkte Messages (group_id NULL) laufen über
--     messages_hunt_member / messages_insert_member (joined, 048).
--     Gruppen-Chats laufen über group_id IN get_my_group_ids().
--     DROP IF EXISTS vor CREATE (idempotenter Re-Run).
-- ============================================================

DROP POLICY IF EXISTS "messages_select_group" ON messages;
CREATE POLICY "messages_select_group" ON messages FOR SELECT
  USING (group_id IN (SELECT public.get_my_group_ids()));

DROP POLICY IF EXISTS "messages_insert_group" ON messages;
CREATE POLICY "messages_insert_group" ON messages FOR INSERT
  WITH CHECK (
    group_id IN (SELECT public.get_my_group_ids())
    AND sender_id = auth.uid()
  );

-- ============================================================
-- 5 — Einmal-Cleanup: Bestands-invited (und sonstige nicht-joined)
--     User aus HUNT-Chat-Gruppen entfernen. Scharf gescopt auf
--     chat_groups.hunt_id IS NOT NULL — Standalone-Gruppen bleiben
--     unangetastet. Ersteller bleibt (ist joined).
-- ============================================================

DELETE FROM chat_group_members cgm
USING chat_groups cg
WHERE cgm.group_id = cg.id
  AND cg.hunt_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hunt_participants hp
    WHERE hp.hunt_id = cg.hunt_id
      AND hp.user_id = cgm.user_id
      AND hp.status  = 'joined'
  );

-- ============================================================
-- GRANT
-- ============================================================

GRANT EXECUTE ON FUNCTION public.accept_hunt_invitation(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_hunt_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_invitations()          TO authenticated;

COMMIT;
