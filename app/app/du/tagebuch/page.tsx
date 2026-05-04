import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJagdjahr, jagdjahrFromKey } from '@/lib/diary/season'
import { getDiaryStats } from '@/lib/diary/queries'
import TagebuchContent from './tagebuch-content'

export default async function TagebuchPage({
  searchParams,
}: {
  // filter wird in 60.3.4 serverseitig validiert + an Queries weitergereicht.
  // Aktuell: nur Type-Widening, Validierung passiert clientseitig in DiaryChipRow.
  searchParams: Promise<{ j?: string; filter?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const jagdjahr =
    params.j && /^\d{4}$/.test(params.j)
      ? jagdjahrFromKey(params.j)
      : getJagdjahr()

  const stats = await getDiaryStats(user.id, jagdjahr)

  return <TagebuchContent jagdjahr={jagdjahr} stats={stats} />
}
