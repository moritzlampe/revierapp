-- ============================================================
-- Fix: Rekursive RLS-Policy auf chat_group_members
-- Die SELECT-Policy referenziert chat_group_members selbst → Endlos-Rekursion.
-- Lösung: SECURITY DEFINER Funktion (wie get_my_hunt_ids für hunt_participants)
-- Stand: 02.04.2026
-- ============================================================

-- === Helper-Funktion (umgeht RLS) ===

CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT group_id FROM chat_group_members WHERE user_id = auth.uid();
$$;

-- === Policies austauschen ===

-- 1) chat_group_members SELECT: war rekursiv
DROP POLICY IF EXISTS "chat_group_members_select" ON chat_group_members;
CREATE POLICY "chat_group_members_select" ON chat_group_members
  FOR SELECT USING (
    group_id IN (SELECT get_my_group_ids())
  );

-- 2) chat_groups SELECT: referenzierte chat_group_members direkt (funktioniert ggf.,
--    aber konsistent die Helper-Funktion nutzen)
DROP POLICY IF EXISTS "chat_groups_select" ON chat_groups;
CREATE POLICY "chat_groups_select" ON chat_groups
  FOR SELECT USING (
    id IN (SELECT get_my_group_ids())
  );

-- 3) messages SELECT für Gruppenchats: ebenfalls Helper nutzen
DROP POLICY IF EXISTS "messages_select_group" ON messages;
CREATE POLICY "messages_select_group" ON messages
  FOR SELECT USING (
    group_id IS NULL OR group_id IN (SELECT get_my_group_ids())
  );

-- 4) messages INSERT für Gruppenchats: ebenfalls Helper nutzen
DROP POLICY IF EXISTS "messages_insert_group" ON messages;
CREATE POLICY "messages_insert_group" ON messages
  FOR INSERT WITH CHECK (
    group_id IS NULL
    OR (group_id IN (SELECT get_my_group_ids()) AND sender_id = auth.uid())
  );
