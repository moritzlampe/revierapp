-- Migration 017: reply_to_message_id für Nachrichten-Antworten
-- Erlaubt Quoting / Reply-Threading im Chat. NULL = normale Nachricht.
-- ON DELETE SET NULL: Wenn Original-Nachricht gelöscht wird, bleibt die Antwort
-- erhalten, Quote zeigt dann "Nachricht nicht verfügbar" im Frontend.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL
  REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

COMMENT ON COLUMN messages.reply_to_message_id IS
  'Optional: ID der Nachricht auf die hier geantwortet wird (Reply/Quote-Feature).';
