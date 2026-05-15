-- ============================================================
-- RevierApp — Index auf chat_groups(updated_at DESC)
-- Sprint chat-perf: Sortier-Query in get_my_chat_list und im
-- bisherigen loadChats-Pfad nutzt diesen Index statt Seq-Scan + Sort.
-- Stand: 15.05.2026
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_groups_updated_at
  ON chat_groups (updated_at DESC);
