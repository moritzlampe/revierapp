'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type DiaryFilter, parseFilter } from '@/lib/diary/filter'

interface ChipDef {
  value: DiaryFilter
  label: string
}

const CHIPS: ChipDef[] = [
  { value: 'alle',       label: 'Alle' },
  { value: 'solo',       label: 'Solo' },
  { value: 'gesell',     label: 'Gesell' },
  { value: 'erlegungen', label: 'Erlegungen' },
  { value: 'anblicke',   label: 'Anblicke' },
]

export default function DiaryChipRow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = parseFilter(searchParams.get('filter'))

  function handleClick(value: DiaryFilter) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'alle') {
      params.delete('filter')
    } else {
      params.set('filter', value)
    }
    const qs = params.toString()
    router.replace(`/app/du/tagebuch${qs ? `?${qs}` : ''}`)
  }

  return (
    <div
      className="flex flex-nowrap overflow-x-auto"
      style={{
        gap: '0.375rem',
        padding: '0.25rem 1.5rem 0.75rem',
        scrollbarWidth: 'none',
      }}
    >
      {CHIPS.map((chip) => {
        const isActive = chip.value === active
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleClick(chip.value)}
            className="flex-shrink-0 inline-flex items-center justify-center whitespace-nowrap"
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              letterSpacing: '0.02em',
              minHeight: '2rem',
              padding: '0.375rem 0.875rem',
              borderRadius: '999px',
              border: `1px solid ${isActive ? 'var(--border-3)' : 'var(--border-2)'}`,
              background: isActive ? 'var(--surface-2)' : 'var(--surface)',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
