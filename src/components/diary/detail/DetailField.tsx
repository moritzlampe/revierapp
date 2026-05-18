import type { ReactNode } from 'react'

type Emphasis = 'strong' | 'medium' | 'soft'

/**
 * Label-über-Value-Feld der Tagebuch-Detailseite. Drei Emphasis-Stufen
 * (Mockup V3: Schussdaten = strong, Stückdaten = medium, Waffendaten = soft).
 * Styles in globals.css unter .tagebuch-surface .detail-field*.
 */
export function DetailField({
  label,
  value,
  emphasis = 'strong',
}: {
  label: string
  value: ReactNode
  emphasis?: Emphasis
}) {
  return (
    <div className="detail-field">
      <div className="detail-field-label">{label}</div>
      <div className={`detail-field-value detail-field-value-${emphasis}`}>
        {value}
      </div>
    </div>
  )
}
