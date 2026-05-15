-- ============================================================
-- RevierApp — RPC get_my_chat_list()
-- Sprint chat-perf: Ersetzt die n+1-Query-Sequenz aus
-- home-content.tsx loadChats() durch einen einzigen Round-Trip.
-- SECURITY DEFINER STABLE, filtert intern manuell auf auth.uid()
-- (analog get_my_group_ids in Migration 009).
-- Stand: 15.05.2026
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_chat_list()
RETURNS TABLE (
  id                       uuid,
  name                     text,
  kind                     text,
  emoji                    text,
  avatar_url               text,
  hunt_id                  uuid,
  hunt_status              text,
  updated_at               timestamptz,
  last_message_content     text,
  last_message_type        text,
  last_message_created_at  timestamptz,
  last_message_sender_id   uuid,
  last_message_sender_name text,
  members                  jsonb,
  my_last_read_at          timestamptz,
  hidden_at                timestamptz,
  unread_count             integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    cg.id,
    cg.name,
    cg.kind,
    cg.emoji,
    cg.avatar_url,
    cg.hunt_id,
    h.status::text                                          AS hunt_status,
    cg.updated_at,
    lm.content                                              AS last_message_content,
    lm.type::text                                           AS last_message_type,
    lm.created_at                                           AS last_message_created_at,
    lm.sender_id                                            AS last_message_sender_id,
    lm_sender.display_name                                  AS last_message_sender_name,
    COALESCE(mem.members, '[]'::jsonb)                      AS members,
    me.last_read_at                                         AS my_last_read_at,
    me.hidden_at,
    COALESCE(uc.unread_count, 0)                            AS unread_count
  FROM chat_groups cg
  INNER JOIN chat_group_members me
    ON me.group_id = cg.id
   AND me.user_id  = auth.uid()
  LEFT JOIN hunts h
    ON h.id = cg.hunt_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.type, m.created_at, m.sender_id
    FROM messages m
    WHERE m.group_id = cg.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  LEFT JOIN profiles lm_sender
    ON lm_sender.id = lm.sender_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'user_id',      cgm.user_id,
               'display_name', p.display_name
             )
           ) AS members
    FROM chat_group_members cgm
    LEFT JOIN profiles p ON p.id = cgm.user_id
    WHERE cgm.group_id = cg.id
  ) mem ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS unread_count
    FROM messages m
    WHERE m.group_id   = cg.id
      AND m.created_at > me.last_read_at
      AND m.sender_id IS DISTINCT FROM auth.uid()
  ) uc ON TRUE
  WHERE me.hidden_at IS NULL
  ORDER BY cg.updated_at DESC;
$$;
