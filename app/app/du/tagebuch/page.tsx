import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TagebuchContent from './tagebuch-content'

export default async function TagebuchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <TagebuchContent />
}
