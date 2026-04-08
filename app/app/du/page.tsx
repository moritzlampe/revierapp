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

  // Verknüpfte Reviere laden
  const { data: districts } = await supabase
    .from('districts')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('name')

  return (
    <DuContent
      userId={user.id}
      email={user.email || ''}
      displayName={profile?.display_name || user.email?.split('@')[0] || 'Jäger'}
      avatarUrl={profile?.avatar_url || null}
      initialStatus={profile?.availability_status || 'available'}
      districts={districts || []}
    />
  )
}
