import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStreckeDetail } from '@/lib/diary/detail-loaders'
import { StreckeDetailContent } from '@/components/diary/detail/StreckeDetailContent'
import { WILD_GROUP_CONFIG, type WildGroup } from '@/lib/species-config'

type Params = { huntId: string }
type SearchParams = { d?: string; g?: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_GROUPS = new Set<WildGroup>(WILD_GROUP_CONFIG.map((c) => c.group))

function isWildGroup(s: string): s is WildGroup {
  return VALID_GROUPS.has(s as WildGroup)
}

/**
 * Strecke-Detailseite: aggregierte Solo-Kills (Hunt × Tag × Wildgruppe).
 * URL: /app/du/tagebuch/strecke/[huntId]?d=YYYY-MM-DD&g=<group>
 *
 * Validierungs-Stufen: huntId UUID, d ISO-Date, g aus WILD_GROUP_CONFIG.
 * Bei ungültigen Params → notFound (kein Redirect auf Default, damit
 * Card→Detail-Routing nie still in eine falsche Strecke springt).
 */
export default async function StreckeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const { huntId } = await params
  const { d, g } = await searchParams

  if (!UUID_RE.test(huntId)) notFound()
  if (!d || !DATE_RE.test(d)) notFound()
  if (!g || !isWildGroup(g)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const detail = await getStreckeDetail(huntId, d, g, user.id)
  if (!detail) notFound()

  return (
    <div className="tagebuch-surface tagebuch-detail">
      <StreckeDetailContent detail={detail} />
    </div>
  )
}
