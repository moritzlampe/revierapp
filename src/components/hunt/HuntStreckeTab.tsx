'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useHuntStrecke } from '@/hooks/useHuntStrecke'
import StreckePhotoSheet from '@/components/hunt/StreckePhotoSheet'
import StreckeHero from '@/components/hunt/strecke/StreckeHero'
import StreckeFilterBar, { type StreckeFilter } from '@/components/hunt/strecke/StreckeFilterBar'
import StreckeBatchCard from '@/components/hunt/strecke/StreckeBatchCard'
import StreckeNachsucheSection from '@/components/hunt/strecke/StreckeNachsucheSection'
import StreckeEmptyState, { type StreckeEmptyRole } from '@/components/hunt/strecke/StreckeEmptyState'
import FotoZielSheet, { type FotoZiel } from '@/components/hunt/strecke/FotoZielSheet'
import KillAuswahlSheet from '@/components/hunt/strecke/KillAuswahlSheet'
import KillDetailSheet from '@/components/kill/KillDetailSheet'
import type { WildArt, WildGroup } from '@/lib/species-config'
import { WILD_ART_TO_GROUP } from '@/lib/species-config'
import {
  maskKillForViewer,
  type DisplayKill,
  type KillerProfile,
  type ViewerContext,
} from '@/lib/strecke/visibility'
import { groupKillsByBatch } from '@/lib/erlegung/groupByBatch'
import { getMoodPhotos, getPhotosForBatch } from '@/lib/strecke/photo-matching'
import { uploadPhoto } from '@/lib/photos/upload'
import { insertHuntPhoto } from '@/lib/photos/hunt-photos'
import { showToast } from '@/lib/erlegung/toast'

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


export default function HuntStreckeTab({ huntId, participants, userId }: HuntStreckeTabProps) {
  const { kills, photos, loading, error } = useHuntStrecke(huntId)
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false)
  const [fotoZielOpen, setFotoZielOpen] = useState(false)
  const [killAuswahlOpen, setKillAuswahlOpen] = useState(false)
  const [detailKill, setDetailKill] = useState<DisplayKill | null>(null)
  const [detailMode, setDetailMode] = useState<'strecke' | 'nachsuche'>('strecke')
  const [filter, setFilter] = useState<StreckeFilter>({ kind: 'all' })
  const [pinnedGroup, setPinnedGroup] = useState<WildGroup | null>(null)
  const nachsucheSectionRef = useRef<HTMLElement | null>(null)

  const openDetail = useCallback((kill: DisplayKill, mode: 'strecke' | 'nachsuche' = 'strecke') => {
    setDetailKill(kill)
    setDetailMode(mode)
  }, [])

  // Hero-Chevron-Tap: pinnt die Wildart-Pill und aktiviert den Filter.
  // Zweiter Tap (auf dieselbe Gruppe oder auf den Pill 'Alle') löst die Pin.
  const handleGroupTap = useCallback((group: WildGroup) => {
    setFilter(current => {
      if (current.kind === 'group' && current.group === group) {
        setPinnedGroup(null)
        return { kind: 'all' }
      }
      setPinnedGroup(group)
      return { kind: 'group', group }
    })
  }, [])

  // Wenn der Filter nicht mehr auf 'group' steht, darf der Wildart-Pill
  // trotzdem sichtbar bleiben (als schneller Re-Toggle). Aber wenn der User
  // explizit 'Alle' wählt, räumen wir die gepinnte Gruppe ab.
  const handleFilterChange = useCallback((next: StreckeFilter) => {
    setFilter(next)
    if (next.kind === 'all') setPinnedGroup(null)
  }, [])

  const handleAddKillPhoto = useCallback(
    async (file: File) => {
      if (!detailKill || !userId) return
      try {
        const { url, path } = await uploadPhoto({
          file,
          userId,
          entityType: 'kill',
          entityId: detailKill.id,
        })
        await insertHuntPhoto({
          huntId,
          killIds: [detailKill.id],
          storagePath: path,
          url,
          uploadedBy: userId,
        })
        showToast('Foto hinzugefügt', 'success')
      } catch (e) {
        console.error('[HuntStreckeTab] Foto-Upload zum Kill fehlgeschlagen', e)
        showToast(
          'Foto konnte nicht hinzugefügt werden',
          'warning',
          e instanceof Error ? e.message : undefined,
        )
      }
    },
    [detailKill, userId, huntId],
  )

  const handleFotoZielSelect = useCallback((ziel: FotoZiel) => {
    setFotoZielOpen(false)
    if (ziel === 'erlegung') {
      setKillAuswahlOpen(true)
      return
    }
    // Streckenfoto & Stimmung → hunt-gebundenes Foto ohne Kill-Referenz.
    // Bestehender StreckePhotoSheet fängt den Flow (Capture + optionale
    // Kill-Auswahl kann leer bleiben).
    setPhotoSheetOpen(true)
  }, [])

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

  // Offizielle Strecke (harvested) vs. Nachsuche (wounded).
  // Hero-Count ignoriert wounded — laut Design-Brief zählen sie jagdrechtlich
  // erst ab Freigabe-Update zur Strecke.
  const harvestedKills = useMemo(
    () => visibleKills.filter(k => k.status === 'harvested'),
    [visibleKills],
  )
  const woundedKills = useMemo(
    () => visibleKills.filter(k => k.status === 'wounded'),
    [visibleKills],
  )

  // Nachsuche-Sichtbarkeit: Jagdleiter sehen alles, Schützen sehen eigene Wounded-Kills
  // (die landen bereits durch maskKillForViewer in visibleKills), Hundeführer sehen alles.
  const canSeeNachsuche = useMemo(() => {
    if (viewer.role === 'jagdleiter') return true
    if (viewer.tags.includes('hundefuehrer')) return true
    return woundedKills.length > 0
  }, [viewer.role, viewer.tags, woundedKills.length])

  const ownHarvestedCount = useMemo(
    () => harvestedKills.filter(k => k.reporter_id === userId).length,
    [harvestedKills, userId],
  )

  const pinnedGroupCount = useMemo(() => {
    if (!pinnedGroup) return 0
    return harvestedKills.filter(
      k => WILD_ART_TO_GROUP[k.wild_art as WildArt] === pinnedGroup,
    ).length
  }, [harvestedKills, pinnedGroup])

  // Filter wirken vor dem Batching. Nachsuche-Filter blendet die
  // Chrono-Liste komplett aus — nur die dedizierte Nachsuche-Sektion
  // bleibt dann sichtbar.
  const filteredKills = useMemo<DisplayKill[]>(() => {
    switch (filter.kind) {
      case 'nachsuche':
        return []
      case 'own':
        return visibleKills.filter(k => k.reporter_id === userId)
      case 'group':
        return visibleKills.filter(
          k => WILD_ART_TO_GROUP[k.wild_art as WildArt] === filter.group,
        )
      case 'all':
      default:
        return visibleKills
    }
  }, [filter, visibleKills, userId])

  // Chronologische Reihenfolge: älteste zuerst (Logbuch-Gedanke —
  // Tagesablauf rekonstruieren). groupKillsByBatch liefert ASC.
  const visibleBatches = useMemo<DisplayKillBatch[]>(
    () => groupKillsByBatch(filteredKills) as DisplayKillBatch[],
    [filteredKills],
  )

  const showChronoList = filter.kind !== 'nachsuche'

  const scrollToNachsuche = useCallback(() => {
    nachsucheSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Foto-Visibility: ein Kill-Foto ist nur sichtbar, wenn mindestens
  // ein referenzierter Kill sichtbar ist. Mood-Fotos (ohne kill_ids)
  // sind für alle Teilnehmer sichtbar — RLS genügt.
  const visibleKillIds = useMemo(
    () => new Set(visibleKills.map(k => k.id)),
    [visibleKills],
  )

  const visiblePhotos = useMemo(
    () =>
      photos.filter(p => {
        if (!p.kill_ids || p.kill_ids.length === 0) return true
        return p.kill_ids.some(kid => visibleKillIds.has(kid))
      }),
    [photos, visibleKillIds],
  )

  const moodPhotos = useMemo(() => getMoodPhotos(visiblePhotos), [visiblePhotos])

  // Pre-computed Set für O(1)-Lookup im KillRow-Indicator.
  const killIdsWithPhotos = useMemo(() => {
    const set = new Set<string>()
    for (const p of visiblePhotos) {
      if (p.kill_ids) for (const kid of p.kill_ids) set.add(kid)
    }
    return set
  }, [visiblePhotos])

  const killPhotoCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of visiblePhotos) {
      if (!p.kill_ids) continue
      for (const kid of p.kill_ids) {
        map.set(kid, (map.get(kid) ?? 0) + 1)
      }
    }
    return map
  }, [visiblePhotos])

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

  if (visibleBatches.length === 0 && moodPhotos.length === 0) {
    const emptyRole: StreckeEmptyRole = !userId
      ? 'gast'
      : viewer.role === 'jagdleiter'
        ? 'jagdleiter'
        : 'schuetze'
    return (
      <StreckeEmptyState
        role={emptyRole}
        onStartErlegung={
          emptyRole === 'gast'
            ? undefined
            : () => window.dispatchEvent(new Event('quickhunt:open-erlegung'))
        }
      />
    )
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      style={{
        display: 'flex',
        flexDirection: 'column',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ padding: '1rem 0.75rem 0' }}>
        <StreckeHero
          harvestedKills={harvestedKills}
          woundedCount={woundedKills.length}
          showNachsucheWarning={canSeeNachsuche && filter.kind !== 'nachsuche'}
          activeGroupFilter={filter.kind === 'group' ? filter.group : null}
          onGroupTap={handleGroupTap}
          onNachsucheTap={scrollToNachsuche}
        />
      </div>
      <div style={{ padding: '1rem 0 0', flexShrink: 0 }}>
        <StreckeFilterBar
          active={filter}
          onChange={handleFilterChange}
          counts={{
            all: harvestedKills.length,
            own: ownHarvestedCount,
            nachsuche: woundedKills.length,
            group: pinnedGroup ? { group: pinnedGroup, count: pinnedGroupCount } : undefined,
          }}
          showNachsuchePill={canSeeNachsuche}
          canUploadPhoto={Boolean(userId)}
          onPhotoClick={() => setFotoZielOpen(true)}
        />
      </div>
      <div
        style={{
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
      {showChronoList ? (
        visibleBatches.length > 0 ? (
          visibleBatches.map(batch => {
            const batchKillIds = batch.kills.map(k => k.id)
            const batchPhotos = getPhotosForBatch(batchKillIds, visiblePhotos)
            return (
              <StreckeBatchCard
                key={batch.id}
                batch={batch}
                photos={batchPhotos}
                killIdsWithPhotos={killIdsWithPhotos}
                killPhotoCounts={killPhotoCounts}
                isOwnBatch={userId !== null && batch.reporter_id === userId}
                viewerUserId={userId}
                onKillTap={kill => openDetail(kill, 'strecke')}
              />
            )
          })
        ) : (
          <p
            style={{
              margin: '0.5rem 0',
              textAlign: 'center',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
            }}
          >
            {filter.kind === 'own'
              ? 'Noch keine eigenen Meldungen.'
              : 'Keine Einträge für diesen Filter.'}
          </p>
        )
      ) : (
        <p
          style={{
            margin: 0,
            padding: '0.5rem 0.25rem',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
          }}
        >
          Weitere Einträge werden ausgeblendet, solange „Nachsuche" aktiv ist.
        </p>
      )}

      {canSeeNachsuche && woundedKills.length > 0 && (
        <StreckeNachsucheSection
          ref={nachsucheSectionRef}
          kills={woundedKills}
          onKillTap={kill => openDetail(kill, 'nachsuche')}
        />
      )}

      {moodPhotos.length > 0 && (
        <button
          type="button"
          onClick={() => {
            // Hunt-Photo-Gallery existiert noch nicht als eigene Komponente.
            // Platzhalter bis zur dedizierten Gallery-Seite.
            console.log('[Strecke] Mood-Gallery öffnen — noch nicht implementiert', moodPhotos.length)
          }}
          style={{
            all: 'unset',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            marginTop: '0.25rem',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxSizing: 'border-box',
            minHeight: '2.75rem',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '1rem' }}>🌅</span>
          <span
            style={{
              flex: 1,
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.01em',
            }}
          >
            {moodPhotos.length} {moodPhotos.length === 1 ? 'Stimmungsfoto' : 'Stimmungsfotos'}
          </span>
          <span
            aria-hidden="true"
            style={{
              color: 'var(--text-secondary)',
              fontSize: '1rem',
            }}
          >
            ›
          </span>
        </button>
      )}
      </div>
      {userId && (
        <>
          <FotoZielSheet
            open={fotoZielOpen}
            onClose={() => setFotoZielOpen(false)}
            onSelect={handleFotoZielSelect}
          />
          <KillAuswahlSheet
            open={killAuswahlOpen}
            onClose={() => setKillAuswahlOpen(false)}
            kills={visibleKills}
            userId={userId}
            huntId={huntId}
            killPhotoCounts={killPhotoCounts}
          />
          <StreckePhotoSheet
            open={photoSheetOpen}
            onOpenChange={setPhotoSheetOpen}
            huntId={huntId}
            userId={userId}
            kills={kills}
            participants={participants}
            viewer={viewer}
          />
        </>
      )}
      <KillDetailSheet
        open={detailKill !== null}
        kill={detailKill}
        mode={detailMode}
        heroPhotoUrl={
          detailKill
            ? visiblePhotos.find(p => p.kill_ids?.includes(detailKill.id))?.url ?? null
            : null
        }
        photoCount={detailKill ? killPhotoCounts.get(detailKill.id) ?? 0 : 0}
        canEdit={
          detailKill !== null &&
          (viewer.role === 'jagdleiter' || detailKill.reporter_id === userId)
        }
        canDelete={
          detailKill !== null &&
          (viewer.role === 'jagdleiter' || detailKill.reporter_id === userId)
        }
        isReporter={detailKill !== null && detailKill.reporter_id === userId}
        onAddPhoto={handleAddKillPhoto}
        onClose={() => setDetailKill(null)}
      />
    </div>
  )
}

