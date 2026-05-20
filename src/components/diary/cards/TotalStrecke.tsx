import type { WildGroupAggregateItem } from '@/lib/species-config'

interface Props {
  /** Aggregierte Strecke aller Reporter auf Wildgruppen-Ebene (Sprint 60.5c). */
  data: WildGroupAggregateItem[]
}

// 60.5b: jetzt erster Sub-Block (über JagdtagBlock) → solider
// Section-Divider zum Type-Pill-Bereich. Der gestrichelte Inter-Block-
// Trenner wandert an JagdtagBlock (zweiter Block). Inhalt unverändert.
const BLOCK: React.CSSProperties = {
  marginTop: '0.5625rem',
  paddingTop: '0.5625rem',
  borderTop: '1px solid var(--border)',
}

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9.5px',
  color: 'var(--text-dim)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  marginBottom: '0.1875rem',
  fontWeight: 600,
}

const LIST: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '12.5px',
  fontWeight: 500,
  color: 'var(--text)',
  lineHeight: 1.3,
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 10px',
}

const ENTRY: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '4px',
}

const NUM: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  color: 'var(--text-muted)',
  fontSize: '12px',
}

const LOCKED: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11.5px',
  color: 'var(--text-dim)',
  letterSpacing: '0.04em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
}

export default function TotalStrecke({ data }: Props) {
  return (
    <div style={BLOCK}>
      <div style={LABEL}>Gesamtstrecke</div>
      {data.length === 0 ? (
        <div style={LOCKED}>keine Strecke gemeldet</div>
      ) : (
        <div style={LIST}>
          {data.map((entry) => (
            <span key={entry.groupKey} style={ENTRY}>
              <span style={NUM}>{entry.count}×</span>
              {entry.groupLabel}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
