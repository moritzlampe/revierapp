'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import {
  JAGDART_FILTERS,
  INHALT_FILTERS,
  parseJagdart,
  parseInhalt,
} from '@/lib/diary/filter'

/**
 * Zwei orthogonale Filter-Reihen (Jagdart + Inhalt), beide single-select.
 * Schreibt ?jagdart= / ?inhalt= in die URL; "alle" = kein Param.
 * Liest den Legacy ?filter=-Param aus Phase 8b mit (stille Migration —
 * URL wird erst beim ersten Chip-Klick neu geschrieben).
 */
export default function DiaryFilterStack() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const legacy = searchParams.get('filter')
  const currentJagdart = parseJagdart(searchParams.get('jagdart'), legacy)
  const currentInhalt = parseInhalt(searchParams.get('inhalt'), legacy)

  function updateParam(name: 'jagdart' | 'inhalt', value: string) {
    const params = new URLSearchParams(searchParams.toString())
    // Beim ersten Klick den Legacy-Param mit aufräumen.
    params.delete('filter')
    if (value === 'alle') {
      params.delete(name)
    } else {
      params.set(name, value)
    }
    const qs = params.toString()
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    })
  }

  return (
    <div className="filter-stack" aria-label="Tagebuch-Filter">
      <div
        className="chip-row jagdart"
        role="group"
        aria-label="Jagdart filtern"
      >
        {JAGDART_FILTERS.map((f) => {
          const isActive = currentJagdart === f.value
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={isActive}
              className={`chip${isActive ? ' active' : ''}`}
              onClick={() => updateParam('jagdart', f.value)}
            >
              {f.label}
            </button>
          )
        })}
      </div>
      <div
        className="chip-row inhalt"
        role="group"
        aria-label="Inhalt filtern"
      >
        {INHALT_FILTERS.map((f) => {
          const isActive = currentInhalt === f.value
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={isActive}
              className={`chip${isActive ? ' active' : ''}`}
              onClick={() => updateParam('inhalt', f.value)}
            >
              {f.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
