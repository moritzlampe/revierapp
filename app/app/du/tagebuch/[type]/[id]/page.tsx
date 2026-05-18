import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getAnblickDetail,
  getErlegungDetail,
  getGesellDetail,
} from '@/lib/diary/detail-loaders'
import { ErlegungDetailContent } from '@/components/diary/detail/ErlegungDetailContent'

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
      <div className="tagebuch-surface min-h-dvh">
        <ErlegungDetailContent detail={detail} />
      </div>
    )
  }

  // gesell / anblick: JSON-Smoke-Output bis Phase 5/6 die Renderer liefern.
  const detail =
    type === 'gesell'
      ? await getGesellDetail(id, user.id)
      : await getAnblickDetail(id, user.id)

  if (!detail) notFound()

  return (
    <div className="tagebuch-surface min-h-dvh">
      <div style={{ padding: '1rem', fontFamily: 'var(--font-body)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            color: 'var(--text)',
            margin: '0 0 0.5rem',
          }}
        >
          {type} · {id}
        </h1>
        <pre
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-2)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '0.75rem',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(detail, null, 2)}
        </pre>
      </div>
    </div>
  )
}
