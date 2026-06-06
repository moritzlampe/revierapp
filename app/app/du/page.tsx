import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DuContent from './du-content'

export default async function DuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, availability_status')
    .eq('id', user.id)
    .single()

  // Verknüpfte Reviere laden (hidden für Ausblenden/Einblenden in der Liste)
  const { data: districts } = await supabase
    .from('districts')
    .select('id, name, hidden')
    .eq('owner_id', user.id)
    .order('name')

  // Offene Einladungen zählen (für Menü-Eintrag + Badge)
  const { data: invitations } = await supabase.rpc('get_my_invitations')
  const invitationCount = Array.isArray(invitations) ? invitations.length : 0

  return (
    <DuContent
      userId={user.id}
      email={user.email || ''}
      displayName={profile?.display_name || user.email?.split('@')[0] || 'Jäger'}
      avatarUrl={profile?.avatar_url || null}
      initialStatus={profile?.availability_status || 'available'}
      districts={districts || []}
      invitationCount={invitationCount}
    />
  )
}
