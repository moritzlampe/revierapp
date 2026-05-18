import { notFound } from 'next/navigation'

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

  // Placeholder — wird in Phase 2 mit echten Loadern + Detail-Renderern ersetzt.
  return (
    <div className="tagebuch-surface min-h-dvh">
      <div style={{ padding: '1.5rem', fontFamily: 'var(--font-body)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          Tagebuch Detail
        </h1>
        <p style={{ color: 'var(--text-2)' }}>Type: {type}</p>
        <p style={{ color: 'var(--text-2)' }}>ID: {id}</p>
      </div>
    </div>
  )
}
