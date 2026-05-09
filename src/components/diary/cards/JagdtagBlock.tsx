import { getSpeciesLabel } from '@/lib/wildArt'

interface SpeciesCount {
  species: string
  count: number
}

interface Props {
  /** Eigene Kills im Hunt, bereits pro species aggregiert. */
  kills: SpeciesCount[]
  /** Eigene Anblicke im Hunt, bereits pro species aggregiert. */
  anblicke: SpeciesCount[]
}

const BLOCK: React.CSSProperties = {
  marginTop: '0.5625rem',
  paddingTop: '0.5625rem',
  borderTop: '1px solid var(--border)',
}

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9.5px',
  color: 'var(--bronze)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  marginBottom: '0.1875rem',
  fontWeight: 600,
}

const VALUE: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text)',
  lineHeight: 1.3,
  letterSpacing: '0.005em',
}

const NUM: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  color: 'var(--text-muted)',
  fontSize: '12px',
  marginRight: '1px',
}

const SEP: React.CSSProperties = {
  color: 'var(--text-faint)',
  margin: '0 6px',
}

const EMPTY: React.CSSProperties = {
  ...VALUE,
  color: 'var(--text-dim)',
  fontStyle: 'italic',
}

/**
 * "Dein Jagdtag"-Sub-Block für GesellCard.
 * Vereint eigene Kills und Anblicke des Hunts in einer Liste (Kills zuerst).
 * Bei vollständig leerem Stand → "ohne Strecke".
 */
export default function JagdtagBlock({ kills, anblicke }: Props) {
  const items: SpeciesCount[] = [...kills, ...anblicke]

  return (
    <div style={BLOCK}>
      <div style={LABEL}>Dein Jagdtag</div>
      {items.length === 0 ? (
        <div style={EMPTY}>ohne Strecke</div>
      ) : (
        <div style={VALUE}>
          {items.map((entry, i) => (
            <span key={`${entry.species}-${i}`}>
              {i > 0 ? <span style={SEP}>·</span> : null}
              <span style={NUM}>{entry.count}×</span>
              {getSpeciesLabel(entry.species)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
