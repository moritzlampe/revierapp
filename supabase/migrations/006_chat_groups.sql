-- ============================================================
-- RevierApp — Chat-Gruppen (Gruppenchats + Jagd-Chats)
-- Stand: 02.04.2026
-- ============================================================

-- === TABELLEN ===

CREATE TABLE IF NOT EXISTS chat_groups (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  emoji       text DEFAULT '💬',
  created_by  uuid REFERENCES auth.users(id) NOT NULL,
  hunt_id     uuid REFERENCES hunts(id) ON DELETE CASCADE, -- NULL = eigenständige Gruppe, gesetzt = Jagd-Chat
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()  -- wird bei jeder neuen Nachricht aktualisiert, für Sortierung
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id    uuid REFERENCES chat_groups(id) ON DELETE CASCADE NOT NULL,
  user_id     uuid REFERENCES auth.users(id) NOT NULL,
  last_read_at timestamptz DEFAULT now(),
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- === MESSAGES ERWEITERN ===

-- hunt_id nullable machen (war NOT NULL)
ALTER TABLE messages ALTER COLUMN hunt_id DROP NOT NULL;

-- group_id Spalte hinzufügen
ALTER TABLE messages ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES chat_groups(id) ON DELETE CASCADE;

-- sender_id für Gruppenchats (kein participant_id nötig)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id);

-- participant_id nullable machen (Gruppenchats haben keinen participant)
ALTER TABLE messages ALTER COLUMN participant_id DROP NOT NULL;

-- Mindestens hunt_id oder group_id muss gesetzt sein
ALTER TABLE messages ADD CONSTRAINT messages_target_check
  CHECK (hunt_id IS NOT NULL OR group_id IS NOT NULL);


-- === ROW LEVEL SECURITY ===

ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members ENABLE ROW LEVEL SECURITY;

-- Gruppen sehen: nur wenn man Mitglied ist
CREATE POLICY "chat_groups_select" ON chat_groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM chat_group_members WHERE user_id = auth.uid())
  );

-- Gruppe erstellen: jeder eingeloggte User
CREATE POLICY "chat_groups_insert" ON chat_groups
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Gruppe updaten: nur Ersteller
CREATE POLICY "chat_groups_update" ON chat_groups
  FOR UPDATE USING (created_by = auth.uid());

-- Gruppe löschen: nur Ersteller
CREATE POLICY "chat_groups_delete" ON chat_groups
  FOR DELETE USING (created_by = auth.uid());

-- Mitglieder sehen: nur wenn man selbst Mitglied der Gruppe ist
CREATE POLICY "chat_group_members_select" ON chat_group_members
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM chat_group_members WHERE user_id = auth.uid())
  );

-- Mitglieder hinzufügen: nur Ersteller der Gruppe
CREATE POLICY "chat_group_members_insert" ON chat_group_members
  FOR INSERT WITH CHECK (
    group_id IN (SELECT id FROM chat_groups WHERE created_by = auth.uid())
  );

-- Eigene Mitgliedschaft updaten (last_read_at)
CREATE POLICY "chat_group_members_update_own" ON chat_group_members
  FOR UPDATE USING (user_id = auth.uid());

-- Mitglieder entfernen: nur Ersteller
CREATE POLICY "chat_group_members_delete" ON chat_group_members
  FOR DELETE USING (
    group_id IN (SELECT id FROM chat_groups WHERE created_by = auth.uid())
  );

-- === MESSAGES RLS für Gruppenchats ===

CREATE POLICY "messages_select_group" ON messages
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM chat_group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "messages_insert_group" ON messages
  FOR INSERT WITH CHECK (
    group_id IN (SELECT group_id FROM chat_group_members WHERE user_id = auth.uid())
    AND sender_id = auth.uid()
  );


-- === REALTIME ===

ALTER PUBLICATION supabase_realtime ADD TABLE chat_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_members;


-- === INDEXES ===

CREATE INDEX idx_chat_group_members_group ON chat_group_members(group_id);
CREATE INDEX idx_chat_group_members_user ON chat_group_members(user_id);
CREATE INDEX idx_chat_groups_hunt ON chat_groups(hunt_id) WHERE hunt_id IS NOT NULL;
CREATE INDEX idx_messages_group_time ON messages(group_id, created_at DESC) WHERE group_id IS NOT NULL;


-- === TRIGGER: updated_at bei neuer Nachricht ===

CREATE OR REPLACE FUNCTION update_chat_group_timestamp()
RETURNS trigger AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE chat_groups SET updated_at = now() WHERE id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_message_update_group_timestamp
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_chat_group_timestamp();
