import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getAnblickDetail,
  getErlegungDetail,
  getGesellDetail,
} from '@/lib/diary/detail-loaders'
import { AnblickDetailContent } from '@/components/diary/detail/AnblickDetailContent'
import { ErlegungDetailContent } from '@/components/diary/detail/ErlegungDetailContent'
import { GesellDetailContent } from '@/components/diary/detail/GesellDetailContent'

type Params = { type: string; id: string }

const VALID_TYPES = ['erlegung', 'gesell', 'anblick'] as const
type DetailType = (typeof VALID_TYPES)[number]

function isValidType(t: string): t is DetailType {
  return (VALID_TYPES as readonly string[]).includes(t)
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validiert das id-Segment je nach Detail-Typ:
 *  - erlegung: kills.id          → UUID
 *  - gesell:   hunts.id          → UUID
 *  - anblick:  hunts.id (Hunt-Kontext) ODER YYYY-MM-DD (Solo-Tag-Aggregat).
 *              TimelineAnblick trägt kein wild_events.id; die Detail-Seite
 *              aggregiert wie timeline.ts buildAnblick() (siehe detail-loaders).
 */
function isValidId(type: DetailType, id: string): boolean {
  if (type === 'anblick') return UUID_RE.test(id) || DATE_RE.test(id)
  return UUID_RE.test(id)
}

export default async function TagebuchDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { type, id } = await params

  if (!isValidType(type)) notFound()
  if (!isValidId(type, id)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (type === 'erlegung') {
    const detail = await getErlegungDetail(id, user.id)
    if (!detail) notFound()
    return (
      <div className="tagebuch-surface tagebuch-detail">
        <ErlegungDetailContent detail={detail} userId={user.id} />
      </div>
    )
  }

  if (type === 'gesell') {
    const detail = await getGesellDetail(id, user.id)
    if (!detail) notFound()
    return (
      <div className="tagebuch-surface tagebuch-detail">
        <GesellDetailContent detail={detail} userId={user.id} />
      </div>
    )
  }

  // anblick
  const detail = await getAnblickDetail(id, user.id)
  if (!detail) notFound()
  return (
    <div className="tagebuch-surface tagebuch-detail">
      <AnblickDetailContent detail={detail} />
    </div>
  )
}
