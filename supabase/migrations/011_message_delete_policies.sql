-- Einzelne Nachrichten löschen: RLS Policies für DELETE auf messages

-- Eigene Nachrichten löschen (sender_id für Gruppenchats)
CREATE POLICY "messages_delete_own_sender"
ON messages FOR DELETE
TO authenticated
USING (sender_id = auth.uid());

-- Eigene Nachrichten löschen (participant_id für Jagdchats)
CREATE POLICY "messages_delete_own_participant"
ON messages FOR DELETE
TO authenticated
USING (
  participant_id IN (
    SELECT id FROM hunt_participants WHERE user_id = auth.uid()
  )
);

-- Gruppen-Ersteller kann alle Nachrichten in seiner Gruppe löschen
CREATE POLICY "messages_delete_group_creator"
ON messages FOR DELETE
TO authenticated
USING (
  group_id IN (SELECT id FROM chat_groups WHERE created_by = auth.uid())
);

-- Jagd-Ersteller kann alle Nachrichten im Jagd-Chat löschen
CREATE POLICY "messages_delete_hunt_creator"
ON messages FOR DELETE
TO authenticated
USING (
  hunt_id IN (SELECT id FROM hunts WHERE creator_id = auth.uid())
);
