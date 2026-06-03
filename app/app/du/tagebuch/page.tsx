import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJagdjahr, jagdjahrFromKey } from '@/lib/diary/season'
import { getDiaryStats, getSeasonKillArten } from '@/lib/diary/queries'
import { getTimelineItems } from '@/lib/diary/timeline'
import { aggregateWildGroupsFull } from '@/lib/species-config'
import TagebuchContent from './tagebuch-content'

export default async function TagebuchPage({
  searchParams,
}: {
  // ?j=YYYY  → Jagdjahr-Auswahl (Default: aktuelles)
  // ?filter= → Filter-Chip (clientseitig in DiaryTimelineList ausgewertet)
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

  const [stats, items, seasonKills] = await Promise.all([
    getDiaryStats(user.id, jagdjahr),
    getTimelineItems(user.id, jagdjahr),
    getSeasonKillArten(user.id, jagdjahr),
  ])

  // Bestiarium: alle 8 Wildgruppen in Picker-Reihenfolge mit Zero-Fill.
  const bestiarium = aggregateWildGroupsFull(seasonKills)

  return (
    <TagebuchContent
      jagdjahr={jagdjahr}
      stats={stats}
      items={items}
      bestiarium={bestiarium}
    />
  )
}
