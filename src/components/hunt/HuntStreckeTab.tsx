'use client'

import { useMemo } from 'react'
import { useHuntKills } from '@/hooks/useHuntKills'
import type { Kill, KillBatch } from '@/lib/types/kill'
import type { Geschlecht, WildArt } from '@/lib/species-config'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
} from '@/lib/species-config'

interface Participant {
  id: string
  user_id: string | null
  guest_name: string | null
  profiles: { display_name: string } | null
}

interface HuntStreckeTabProps {
  huntId: string
  participants: Participant[]
  userId: string | null
  isJagdleiter: boolean
}

function getWildArtLabel(wildArt: string): string {
  for (const details of Object.values(WILD_GROUP_DETAILS)) {
    if (!details) continue
    const found = details.altersklassen.find(a => a.value === wildArt)
    if (found) return found.label
  }
  for (const list of Object.values(FLAT_GROUP_TIERE)) {
    const found = list?.find(a => a.value === wildArt)
    if (found) return found.label
  }
  const group = WILD_GROUP_CONFIG.find(g => g.unspezValue === wildArt as WildArt)
  if (group) return group.label
  return wildArt
}

function getGeschlechtLabel(g: Geschlecht | null | undefined): string | null {
  if (!g) return null
  if (g === 'maennlich') return 'männlich'
  if (g === 'weiblich') return 'weiblich'
  return null
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function HuntStreckeTab({ huntId, participants }: HuntStreckeTabProps) {
  const { batches, loading, error } = useHuntKills(huntId)

  // reporter_id → display_name
  const reporterNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of participants) {
      if (p.user_id) {
        map.set(p.user_id, p.profiles?.display_name || p.guest_name || 'Unbekannt')
      }
    }
    return map
  }, [participants])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Lädt…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm" style={{ color: 'var(--red)' }}>Fehler beim Laden der Strecke.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{error.message}</p>
      </div>
    )
  }

  if (batches.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">🦌</div>
        <p className="text-lg font-bold mb-1">Noch keine Erlegungen</p>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Meldungen erscheinen hier automatisch.
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      {batches.map(batch => (
        <BatchCard
          key={batch.id}
          batch={batch}
          reporterName={reporterNames.get(batch.reporter_id) ?? 'Unbekannt'}
        />
      ))}
    </div>
  )
}

function BatchCard({ batch, reporterName }: { batch: KillBatch; reporterName: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.625rem 0.875rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{formatTime(batch.first_at)}</span>
        <span style={{ color: 'var(--text-3)' }}>·</span>
        <span style={{ color: 'var(--text-2)' }}>
          Von: <span style={{ color: 'var(--text)' }}>{reporterName}</span>
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0.25rem 0' }}>
        {batch.kills.map(k => (
          <KillRow key={k.id} kill={k} />
        ))}
      </ul>
    </div>
  )
}

function KillRow({ kill }: { kill: Kill }) {
  const label = getWildArtLabel(kill.wild_art)
  const geschlecht = getGeschlechtLabel(kill.geschlecht)
  const extras: string[] = []
  if (geschlecht) extras.push(geschlecht)
  if (kill.altersklasse) extras.push(kill.altersklasse)

  return (
    <li
      style={{
        padding: '0.5rem 0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.9375rem',
      }}
    >
      <span style={{ color: 'var(--text-3)' }}>•</span>
      <span style={{ color: 'var(--text)' }}>{label}</span>
      {extras.length > 0 && (
        <span style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>
          ({extras.join(', ')})
        </span>
      )}
      {kill.status === 'wounded' && (
        <span style={{ marginLeft: 'auto' }} title="Krankgeschossen">🩹</span>
      )}
    </li>
  )
}
