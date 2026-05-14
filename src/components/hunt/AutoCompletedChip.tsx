import { isHuntAutoCompleted } from '@/lib/hunt/status'

interface AutoCompletedChipProps {
  status: string | null | undefined
}

export function AutoCompletedChip({ status }: AutoCompletedChipProps) {
  if (!isHuntAutoCompleted(status)) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '0.5rem',
        padding: '1px 6px',
        borderRadius: '4px',
        background: 'rgba(139,135,117,0.12)',
        border: '1px solid var(--slate-edge)',
        color: 'var(--slate)',
        fontFamily: 'var(--font-mono)',
        fontSize: '9.5px',
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      auto-beendet
    </span>
  )
}
