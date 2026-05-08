'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { TimelineItem } from '@/lib/diary/timeline'
import DiaryTimeline, { MonthLabel } from './DiaryTimeline'
import ErlegungCard from './ErlegungCard'

type Filter = 'alle' | 'erlegungen' | 'jagdtage'

const VALID: ReadonlyArray<Filter> = ['alle', 'erlegungen', 'jagdtage']

function parseFilter(raw: string | null): Filter {
  if (raw && (VALID as ReadonlyArray<string>).includes(raw)) return raw as Filter
  return 'alle'
}

const MONTH_FMT = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

function monthKey(d: Date): string {
  // YYYY-MM in Europe/Berlin — used as group key (stable across DST).
  const parts = new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Europe/Berlin',
  }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  return `${y}-${m}`
}

interface Props {
  items: TimelineItem[]
}

/**
 * Client wrapper that reads the URL filter param, applies it to the timeline
 * items, groups by month, and renders cards inside <DiaryTimeline>.
 *
 * Phase 2.1 only renders ErlegungCards; Anblick/Gesell come in 2.3.
 * Filter-aware empty states come in 2.4.
 */
export default function DiaryTimelineList({ items }: Props) {
  const searchParams = useSearchParams()
  const filter = parseFilter(searchParams.get('filter'))

  const filtered = useMemo(() => {
    if (filter === 'erlegungen') {
      return items.filter(i => i.kind === 'erlegung' || i.kind === 'strecke')
    }
    // 'alle' and 'jagdtage' both pass everything through for now;
    // 'jagdtage' semantics get refined in Phase 2.4.
    return items
  }, [items, filter])

  // Hunt-IDs that are independently represented as Strecke- or Gesell-Cards.
  // ErlegungCards belonging to such hunts must NOT show the breadcrumb
  // (Konzept V3 §3 — "Hunt mit 1 Erlegung"-Sonderfall).
  const representedHuntIds = useMemo(() => {
    const set = new Set<string>()
    for (const i of filtered) {
      if ((i.kind === 'gesell' || i.kind === 'strecke') && i.huntId) {
        set.add(i.huntId)
      }
    }
    return set
  }, [filtered])

  // Group by month, preserving the descending sort order from getTimelineItems.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: TimelineItem[] }[] = []
    for (const item of filtered) {
      const key = monthKey(item.occurredAt)
      const last = out[out.length - 1]
      if (last && last.key === key) {
        last.items.push(item)
      } else {
        out.push({
          key,
          label: MONTH_FMT.format(item.occurredAt),
          items: [item],
        })
      }
    }
    return out
  }, [filtered])

  if (groups.length === 0) return null

  return (
    <DiaryTimeline>
      {groups.map(group => (
        <div key={group.key}>
          <MonthLabel label={group.label} />
          {group.items.map(item => {
            if (item.kind === 'erlegung') {
              const breadcrumbText =
                item.huntId && !representedHuntIds.has(item.huntId)
                  ? item.place
                  : null
              return (
                <ErlegungCard
                  key={item.id}
                  item={item}
                  breadcrumbText={breadcrumbText}
                />
              )
            }
            // Phase 2.1: Anblick/Gesell/Strecke not yet rendered; ignored silently.
            return null
          })}
        </div>
      ))}
    </DiaryTimeline>
  )
}
