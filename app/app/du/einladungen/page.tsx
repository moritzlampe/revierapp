import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EinladungenContent, { type Invitation } from './einladungen-content'

export default async function EinladungenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Einladungen + Ersteller-/Revier-Name in einem Round-Trip (RPC umgeht die
  // profiles-Sperre aus Migration 048, ohne sie zu durchlöchern).
  const { data: invitations } = await supabase.rpc('get_my_invitations')

  return <EinladungenContent initialInvitations={(invitations as Invitation[]) ?? []} userId={user.id} />
}
