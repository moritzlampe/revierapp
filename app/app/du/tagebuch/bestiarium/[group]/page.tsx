import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJagdjahr, jagdjahrFromKey } from '@/lib/diary/season'
import { getBestiariumDetail } from '@/lib/diary/detail-loaders'
import { WILD_GROUP_CONFIG, type WildGroup } from '@/lib/species-config'
import { BestiariumDetailContent } from '@/components/diary/detail/BestiariumDetailContent'

const VALID_GROUPS = WILD_GROUP_CONFIG.map((c) => c.group)

function isValidGroup(g: string): g is WildGroup {
  return (VALID_GROUPS as readonly string[]).includes(g)
}

/**
 * Bestiarium-Detailseite einer Wildgruppe (Sprint 60.5f).
 *  - group: einer der 8 WildGroup-Keys, sonst notFound()
 *  - ?j=YYYY: Jagdjahr-Kontext, konsistent zur Tagebuch-Seite (Default: aktuell)
 */
export default async function BestiariumDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>
  searchParams: Promise<{ j?: string }>
}) {
  const { group } = await params
  if (!isValidGroup(group)) notFound()

  const { j } = await searchParams
  const jagdjahr =
    j && /^\d{4}$/.test(j) ? jagdjahrFromKey(j) : getJagdjahr()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const detail = await getBestiariumDetail(group, user.id, jagdjahr)
  if (!detail) notFound()

  return (
    <div className="tagebuch-surface tagebuch-detail">
      <BestiariumDetailContent detail={detail} />
    </div>
  )
}
