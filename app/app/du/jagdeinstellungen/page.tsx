import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import JagdeinstellungenContent from './jagdeinstellungen-content'

export default async function JagdeinstellungenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('anonymize_kills')
    .eq('id', user.id)
    .single()

  return (
    <JagdeinstellungenContent
      userId={user.id}
      initialAnonymizeKills={profile?.anonymize_kills ?? false}
    />
  )
}
