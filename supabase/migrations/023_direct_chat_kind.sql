-- ============================================================
-- RevierApp — kind-Spalte auf chat_groups + get_or_create_direct_chat
-- Ermöglicht saubere Unterscheidung von Direkt-/Gruppen-/Jagd-Chats
-- und atomare Deduplizierung beim Erstellen von Direkt-Chats.
-- Stand: 10.04.2026
-- ============================================================

-- === 1) kind-Spalte hinzufügen ===

ALTER TABLE chat_groups
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'group';

-- === 2) Backfill: erst hunt, dann direct ===

-- Jagd-Chats
UPDATE chat_groups SET kind = 'hunt' WHERE hunt_id IS NOT NULL;

-- Direkt-Chats (hunt_id IS NULL UND genau 2 Mitglieder)
UPDATE chat_groups SET kind = 'direct'
WHERE hunt_id IS NULL
  AND id IN (
    SELECT group_id FROM chat_group_members
    GROUP BY group_id HAVING count(*) = 2
  );

-- === 3) Index für schnelle Suche nach Direkt-Chats ===

CREATE INDEX IF NOT EXISTS idx_chat_groups_kind ON chat_groups(kind);

-- === 4) get_or_create_direct_chat() ===

CREATE OR REPLACE FUNCTION get_or_create_direct_chat(
  other_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  existing_chat_id UUID;
  new_chat_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF current_user_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot create chat with self';
  END IF;

  -- Existierenden Direkt-Chat zwischen den beiden Usern suchen
  SELECT cg.id INTO existing_chat_id
  FROM chat_groups cg
  WHERE cg.kind = 'direct'
    AND EXISTS (
      SELECT 1 FROM chat_group_members WHERE group_id = cg.id AND user_id = current_user_id
    )
    AND EXISTS (
      SELECT 1 FROM chat_group_members WHERE group_id = cg.id AND user_id = other_user_id
    )
  LIMIT 1;

  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;

  -- Neuen Direkt-Chat erstellen
  INSERT INTO chat_groups (name, kind, created_by)
  VALUES ('Direkt', 'direct', current_user_id)
  RETURNING id INTO new_chat_id;

  INSERT INTO chat_group_members (group_id, user_id)
  VALUES
    (new_chat_id, current_user_id),
    (new_chat_id, other_user_id);

  RETURN new_chat_id;
END;
$$;
