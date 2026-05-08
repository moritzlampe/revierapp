import type { ReactNode } from 'react'

interface DiaryTimelineProps {
  children: ReactNode
}

/**
 * Vertical rail wrapper for the diary timeline.
 * Renders the continuous 1px rail line on the left; the colored type-dots
 * (--bronze / --forest / --slate) sit inside each card and are positioned
 * onto the rail at left:-16px relative to the card.
 *
 * Mockup reference: docs/wireframes/Jagdtagebuch_Mockup_Sprint60_V1-5.html
 *   .timeline { padding: 0 20px 0 36px; }
 *   .timeline::before { left: 24px; top: 36px; bottom: 4px; width: 1px; }
 */
export default function DiaryTimeline({ children }: DiaryTimelineProps) {
  return (
    <div
      className="relative"
      style={{ padding: '0 1.25rem 0 2.25rem' }}
    >
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          left: '1.5rem',
          top: '2.25rem',
          bottom: '0.25rem',
          width: '1px',
          background: 'var(--border-2)',
        }}
      />
      {children}
    </div>
  )
}

interface MonthLabelProps {
  /** German month + year, e.g. "April 2026" */
  label: string
}

/**
 * Month section header inside the timeline. Trailing 1px line via ::after-equivalent
 * span so we keep the inline-style pattern consistent with the rest of diary/.
 */
export function MonthLabel({ label }: MonthLabelProps) {
  return (
    <div
      className="flex items-center"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        fontWeight: 500,
        color: 'var(--text-dim)',
        margin: '0.25rem 0.25rem 0.75rem',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        gap: '0.75rem',
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        style={{ flex: 1, height: '1px', background: 'var(--border)' }}
      />
    </div>
  )
}
