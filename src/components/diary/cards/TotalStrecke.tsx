import { LockSimple } from '@phosphor-icons/react/dist/ssr'
import { getSpeciesLabel } from '@/lib/wildArt'

interface SpeciesCount {
  species: string
  count: number
}

interface Props {
  /**
   * Aggregierte Strecke aller Reporter, oder 'locked' wenn der Jagdleiter
   * `share_total_strecke=false` gesetzt hat und der User nicht der Creator ist.
   */
  data: SpeciesCount[] | 'locked'
}

const BLOCK: React.CSSProperties = {
  marginTop: '0.5625rem',
  paddingTop: '0.5625rem',
  borderTop: '1px dashed var(--border-2)',
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
      {data === 'locked' ? (
        <div style={LOCKED}>
          <LockSimple size={12} weight="regular" color="var(--text-faint)" />
          vom Jagdleiter nicht geteilt
        </div>
      ) : data.length === 0 ? (
        <div style={LOCKED}>keine Strecke gemeldet</div>
      ) : (
        <div style={LIST}>
          {data.map((entry) => (
            <span key={entry.species} style={ENTRY}>
              <span style={NUM}>{entry.count}×</span>
              {getSpeciesLabel(entry.species)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
