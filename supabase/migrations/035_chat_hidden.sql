ALTER TABLE chat_group_members
  ADD COLUMN hidden_at timestamptz;

CREATE INDEX idx_chat_group_members_hidden_lookup
  ON chat_group_members(user_id)
  WHERE hidden_at IS NOT NULL;

CREATE OR REPLACE FUNCTION unhide_chat_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE chat_group_members
       SET hidden_at = NULL
     WHERE group_id = NEW.group_id
       AND hidden_at IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_message_unhide_chat
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION unhide_chat_on_new_message();
