'use client'

import { useMemo } from 'react'
import { useHuntKills } from '@/hooks/useHuntKills'
import type { Geschlecht, WildArt } from '@/lib/species-config'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
} from '@/lib/species-config'
import {
  maskKillForViewer,
  type DisplayKill,
  type KillerProfile,
  type ViewerContext,
} from '@/lib/strecke/visibility'
import { groupKillsByBatch } from '@/lib/erlegung/groupByBatch'

interface Participant {
  id: string
  user_id: string | null
  guest_name: string | null
  role: string
  tags: string[]
  profiles: { display_name: string; anonymize_kills: boolean } | null
}

interface HuntStreckeTabProps {
  huntId: string
  participants: Participant[]
  userId: string | null
  isJagdleiter: boolean
}

// Lokale Variante von KillBatch mit DisplayKill-Elementen —
// display_name + is_anonymized kommen aus der Maskierung.
interface DisplayKillBatch {
  id: string
  reporter_id: string
  first_at: string
  last_at: string
  kills: DisplayKill[]
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

export default function HuntStreckeTab({ huntId, participants, userId }: HuntStreckeTabProps) {
  const { kills, loading, error } = useHuntKills(huntId)

  // Viewer-Kontext: eigene Rolle + Anonymisierungswunsch.
  const viewer = useMemo<ViewerContext>(() => {
    if (!userId) {
      return {
        user_id: null,
        role: 'schuetze',
        anonymize_kills: false,
        tags: [],
        shf_qualified: false,
      }
    }
    const myParticipant = participants.find(p => p.user_id === userId)
    const role: ViewerContext['role'] =
      myParticipant?.role === 'jagdleiter' ? 'jagdleiter' : 'schuetze'
    const tags = (myParticipant?.tags ?? []).filter(
      (t): t is 'gruppenleiter' | 'hundefuehrer' =>
        t === 'gruppenleiter' || t === 'hundefuehrer',
    )
    return {
      user_id: userId,
      role,
      anonymize_kills: myParticipant?.profiles?.anonymize_kills ?? false,
      tags,
      shf_qualified: false, // V1: noch nicht verfügbar
    }
  }, [participants, userId])

  // reporter_id → KillerProfile für Helper.
  const profileMap = useMemo<Map<string, KillerProfile>>(() => {
    const map = new Map<string, KillerProfile>()
    for (const p of participants) {
      if (p.user_id && p.profiles) {
        map.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.profiles.display_name,
          anonymize_kills: p.profiles.anonymize_kills,
        })
      }
    }
    return map
  }, [participants])

  // Maskierung pro Kill, null-Einträge (Krank+nicht privilegiert) rausfiltern.
  const visibleKills = useMemo(
    () =>
      kills
        .map(k => maskKillForViewer(k, profileMap.get(k.reporter_id), viewer))
        .filter((k): k is DisplayKill => k !== null),
    [kills, profileMap, viewer],
  )

  // Batching erst NACH Filter — sonst könnten gemischte Batches entstehen,
  // bei denen der sichtbare Anteil vorne/hinten auseinanderbricht.
  const visibleBatches = useMemo<DisplayKillBatch[]>(
    () => groupKillsByBatch(visibleKills).slice().reverse() as DisplayKillBatch[],
    [visibleKills],
  )

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

  if (visibleBatches.length === 0) {
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
      className="flex-1 min-h-0 overflow-y-auto"
      style={{
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {visibleBatches.map(batch => (
        <BatchCard key={batch.id} batch={batch} />
      ))}
    </div>
  )
}

function BatchCard({ batch }: { batch: DisplayKillBatch }) {
  // Alle Kills im Batch haben denselben reporter_id, also auch denselben
  // maskierten display_name und is_anonymized-Flag.
  const reporterName = batch.kills[0].display_name
  const isAnonymized = batch.kills[0].is_anonymized

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
          Von:{' '}
          <span style={{ color: isAnonymized ? 'var(--text-2)' : 'var(--text)' }}>
            {reporterName}
          </span>
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

function KillRow({ kill }: { kill: DisplayKill }) {
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
      {kill.status === 'wounded' && (
        <span
          aria-label="Krankschuss"
          title="Krankgeschossen"
          style={{ fontSize: '0.875rem', color: 'var(--orange)' }}
        >
          🩹
        </span>
      )}
      {extras.length > 0 && (
        <span style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>
          ({extras.join(', ')})
        </span>
      )}
    </li>
  )
}
