'use client'

import { useRouter } from 'next/navigation'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import {
  type Jagdjahr,
  prevJagdjahr,
  nextJagdjahr,
} from '@/lib/diary/season'

interface Props {
  jagdjahr: Jagdjahr
}

export default function SeasonPicker({ jagdjahr }: Props) {
  const router = useRouter()

  function goPrev() {
    const target = prevJagdjahr(jagdjahr)
    router.replace(`/app/du/tagebuch?j=${target.key}`)
  }
  function goNext() {
    const target = nextJagdjahr(jagdjahr)
    router.replace(`/app/du/tagebuch?j=${target.key}`)
  }

  return (
    <div
      className="inline-flex items-center gap-1.5"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: 'var(--text-2)',
      }}
    >
      <button
        type="button"
        onClick={goPrev}
        aria-label="Vorheriges Jagdjahr"
        className="inline-flex items-center justify-center"
        style={{
          minWidth: '2.75rem',
          minHeight: '2.75rem',
          color: 'var(--text-faint)',
        }}
      >
        <CaretLeft size={14} weight="regular" />
      </button>
      <span>{jagdjahr.label}</span>
      <button
        type="button"
        onClick={goNext}
        aria-label="Nächstes Jagdjahr"
        className="inline-flex items-center justify-center"
        style={{
          minWidth: '2.75rem',
          minHeight: '2.75rem',
          color: 'var(--text-faint)',
        }}
      >
        <CaretRight size={14} weight="regular" />
      </button>
    </div>
  )
}
