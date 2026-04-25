// Chat-Gruppen-Aktionen: Verlassen + Löschen
// Wird sowohl vom Chat-Header als auch von der Gruppeninfo-Seite genutzt

import type { SupabaseClient } from '@supabase/supabase-js'

type ActionResult = { error: Error | null }

// Eigene Mitgliedschaft löschen. Falls letztes Mitglied: Gruppe entfernen.
export async function leaveChatGroup(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<ActionResult> {
  const { error: leaveError } = await supabase
    .from('chat_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (leaveError) return { error: leaveError as unknown as Error }

  const { count, error: countError } = await supabase
    .from('chat_group_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
  if (countError) return { error: countError as unknown as Error }

  if (count === 0) {
    const { error: groupError } = await supabase
      .from('chat_groups')
      .delete()
      .eq('id', groupId)
    if (groupError) return { error: groupError as unknown as Error }
  }
  return { error: null }
}

// Gruppe + alle Mitglieder + alle Nachrichten löschen
export async function deleteChatGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<ActionResult> {
  const { error: membersError } = await supabase
    .from('chat_group_members')
    .delete()
    .eq('group_id', groupId)
  if (membersError) return { error: membersError as unknown as Error }

  const { error: messagesError } = await supabase
    .from('messages')
    .delete()
    .eq('group_id', groupId)
  if (messagesError) return { error: messagesError as unknown as Error }

  const { error: groupError } = await supabase
    .from('chat_groups')
    .delete()
    .eq('id', groupId)
  if (groupError) return { error: groupError as unknown as Error }

  return { error: null }
}
