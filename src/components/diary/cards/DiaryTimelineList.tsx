'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { TimelineItem } from '@/lib/diary/timeline'
import { type DiaryFilter, parseFilter, matchesFilter } from '@/lib/diary/filter'
import DiaryTimeline, { MonthLabel } from './DiaryTimeline'
import ErlegungCard from './ErlegungCard'
import AnblickCard from './AnblickCard'
import GesellCard from './GesellCard'

function assertNever(x: never): never {
  throw new Error(`Unhandled timeline item kind: ${JSON.stringify(x)}`)
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
 * Renders ErlegungCard, AnblickCard, GesellCard. StreckeCard (kind='strecke')
 * is reserved for a later sprint. Filter-aware empty states come in Phase 2.4.
 */
export default function DiaryTimelineList({ items }: Props) {
  const searchParams = useSearchParams()
  const filter: DiaryFilter = parseFilter(searchParams.get('filter'))

  const filtered = useMemo(
    () => items.filter(i => matchesFilter(i, filter)),
    [items, filter],
  )

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

  if (groups.length === 0) {
    // 'alle' delegates to the container-level empty state in tagebuch-content.tsx
    // (driven by Server-Stats). Filter-specific empties render an inline hint here.
    if (filter === 'alle') return null
    const emptyText =
      filter === 'erlegungen' ? 'Keine Erlegungen in dieser Saison'
      : filter === 'anblicke' ? 'Keine Anblicke notiert'
      : filter === 'gesell' ? 'Keine Gesellschaftsjagden'
      : 'Keine Solo-Einträge'
    return (
      <div
        style={{
          padding: '2rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
        }}
      >
        {emptyText}
      </div>
    )
  }

  return (
    <DiaryTimeline>
      {groups.map(group => (
        <div key={group.key}>
          <MonthLabel label={group.label} />
          {group.items.map(item => {
            switch (item.kind) {
              case 'erlegung': {
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
              case 'strecke':
                // TODO 60.3.x: StreckeCard
                return null
              case 'gesell':
                return <GesellCard key={item.id} item={item} />
              case 'anblick':
                return <AnblickCard key={item.id} item={item} />
              default:
                return assertNever(item)
            }
          })}
        </div>
      ))}
    </DiaryTimeline>
  )
}
