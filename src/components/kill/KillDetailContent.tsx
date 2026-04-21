'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, User, Weight, MapPin, Star, Share2, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { DisplayKill } from '@/lib/strecke/visibility'
import {
  WILD_ART_TO_GROUP,
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
  type Geschlecht,
  type WildArt,
} from '@/lib/species-config'
import { getSpeciesIcon } from '@/components/icons/SpeciesIcons'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/lib/erlegung/toast'

export type KillDetailMode = 'strecke' | 'nachsuche'

interface KillDetailContentProps {
  kill: DisplayKill
  mode: KillDetailMode
  /** Erstes Foto zum Kill — optional, wird als Hero gerendert. */
  heroPhotoUrl?: string | null
  /** Anzahl aller zugeordneten Fotos (für Caption). */
  photoCount?: number
  canEdit?: boolean
  canDelete?: boolean
  /**
   * Nur der ursprüngliche Reporter darf kapital/notiz ändern
   * (RLS: kills_reporter-Policy). Andere Viewer sehen die Werte read-only.
   */
  isReporter?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onShare?: () => void
}

interface LatLng { lat: number; lng: number }

function extractLatLng(position: unknown): LatLng | null {
  if (!position || typeof position !== 'object') return null
  // GeoJSON Point: { type: 'Point', coordinates: [lng, lat] }
  if ('coordinates' in position) {
    const c = (position as { coordinates?: unknown }).coordinates
    if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      return { lat: c[1], lng: c[0] }
    }
  }
  // Alternativ: {lat, lng}
  if ('lat' in position && 'lng' in position) {
    const p = position as { lat?: unknown; lng?: unknown }
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      return { lat: p.lat, lng: p.lng }
    }
  }
  return null
}

function wildArtLabel(wildArt: string): string {
  for (const details of Object.values(WILD_GROUP_DETAILS)) {
    if (!details) continue
    const found = details.altersklassen.find(a => a.value === wildArt)
    if (found) return found.label
  }
  for (const list of Object.values(FLAT_GROUP_TIERE)) {
    const found = list?.find(a => a.value === wildArt)
    if (found) return found.label
  }
  const group = WILD_GROUP_CONFIG.find(g => g.unspezValue === (wildArt as WildArt))
  if (group) return group.label
  return wildArt
}

function wildGroupLabel(wildArt: string): string {
  const group = WILD_ART_TO_GROUP[wildArt as WildArt]
  if (!group) return ''
  return WILD_GROUP_CONFIG.find(c => c.group === group)?.label ?? ''
}

function geschlechtLabel(g: Geschlecht | null | undefined): string | null {
  if (!g) return null
  if (g === 'maennlich') return 'männlich'
  if (g === 'weiblich') return 'weiblich'
  return null
}

function formatFullTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function KillDetailContent({
  kill,
  mode,
  heroPhotoUrl,
  photoCount = 0,
  canEdit = false,
  canDelete = false,
  isReporter = false,
  onEdit,
  onDelete,
  onShare,
}: KillDetailContentProps) {
  const supabase = useMemo(() => createClient(), [])

  // Lokaler, optimistisch gepflegter Zustand. Wird bei Wechsel des Kills
  // (anderes Detail-Sheet geöffnet) auf die DB-Werte zurückgesetzt.
  const [kapital, setKapital] = useState<boolean>(kill.kapital)
  const [note, setNote] = useState<string>(kill.notiz ?? '')
  const [editingNote, setEditingNote] = useState(false)
  const [savingKapital, setSavingKapital] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setKapital(kill.kapital)
    setNote(kill.notiz ?? '')
    setEditingNote(false)
  }, [kill.id, kill.kapital, kill.notiz])

  useEffect(() => {
    if (editingNote) {
      setTimeout(() => noteRef.current?.focus(), 50)
    }
  }, [editingNote])

  const canEditReporterFields = isReporter

  const handleKapitalToggle = useCallback(async () => {
    if (!canEditReporterFields || savingKapital) return
    const next = !kapital
    setKapital(next) // optimistisch
    setSavingKapital(true)
    const { error } = await supabase
      .from('kills')
      .update({ kapital: next })
      .eq('id', kill.id)
    setSavingKapital(false)
    if (error) {
      setKapital(!next) // zurückrollen
      showToast('Konnte nicht gespeichert werden', 'warning', error.message)
    }
  }, [canEditReporterFields, savingKapital, kapital, supabase, kill.id])

  const handleNoteCommit = useCallback(async () => {
    setEditingNote(false)
    if (!canEditReporterFields) return
    const next = note.trim()
    const prev = (kill.notiz ?? '').trim()
    if (next === prev) return
    setSavingNote(true)
    const { error } = await supabase
      .from('kills')
      .update({ notiz: next.length > 0 ? next : null })
      .eq('id', kill.id)
    setSavingNote(false)
    if (error) {
      setNote(kill.notiz ?? '') // zurückrollen
      showToast('Notiz konnte nicht gespeichert werden', 'warning', error.message)
    }
  }, [canEditReporterFields, note, kill.notiz, kill.id, supabase])

  const latLng = extractLatLng(kill.position)
  const detailsTitle = [
    wildArtLabel(kill.wild_art),
    geschlechtLabel(kill.geschlecht),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Hero: Foto oder großes Emoji */}
      <Hero wildArt={kill.wild_art} photoUrl={heroPhotoUrl} photoCount={photoCount} />

      {/* Titel + Gruppe */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 1rem' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          {wildGroupLabel(kill.wild_art)}
        </span>
        <h2
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
          }}
        >
          {detailsTitle}
        </h2>
        {mode === 'nachsuche' && (
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--alert-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            In Nachsuche
          </span>
        )}
      </div>

      {/* Meta-Reihe (horizontal scrollbar) */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          overflowX: 'auto',
          padding: '0 1rem',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <MetaChip icon={<Clock size={14} />} label={formatFullTime(kill.erlegt_am ?? kill.created_at)} />
        <MetaChip
          icon={<User size={14} />}
          label={kill.display_name}
          italic={kill.is_anonymized}
        />
        {typeof kill.gewicht_kg === 'number' && (
          <MetaChip icon={<Weight size={14} />} label={`${kill.gewicht_kg.toFixed(1)} kg`} />
        )}
        {latLng && (
          <MetaChip
            icon={<MapPin size={14} />}
            label={`${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`}
          />
        )}
      </div>

      {/* Mini-Map */}
      {latLng && <MiniMap latLng={latLng} />}

      {/* Kapital-Toggle */}
      <div style={{ padding: '0 1rem' }}>
        <button
          type="button"
          onClick={handleKapitalToggle}
          disabled={!canEditReporterFields || savingKapital}
          aria-pressed={kapital}
          style={{
            all: 'unset',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            width: '100%',
            padding: '0.75rem',
            background: kapital ? 'color-mix(in srgb, var(--accent-gold) 18%, var(--bg-base))' : 'var(--bg-base)',
            border: `1px solid ${kapital ? 'var(--accent-gold)' : 'var(--border-default)'}`,
            borderRadius: '10px',
            cursor: canEditReporterFields ? 'pointer' : 'default',
            opacity: canEditReporterFields ? 1 : 0.75,
            boxSizing: 'border-box',
            minHeight: '2.75rem',
          }}
        >
          <Star
            size={18}
            style={{
              color: kapital ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fill: kapital ? 'var(--accent-gold)' : 'transparent',
            }}
          />
          <span style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', flex: 1 }}>
            {kapital ? 'Als kapital markiert' : 'Als kapital markieren'}
          </span>
          {savingKapital && (
            <Loader2
              size={14}
              aria-label="Wird gespeichert"
              style={{
                color: 'var(--text-secondary)',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          )}
        </button>
      </div>

      {/* Notiz-Feld */}
      <div style={{ padding: '0 1rem', position: 'relative' }}>
        {editingNote ? (
          <textarea
            ref={noteRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={handleNoteCommit}
            placeholder="Notiz zu diesem Stück…"
            rows={3}
            style={{
              width: '100%',
              padding: '0.625rem',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-strong)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '0.9375rem',
              lineHeight: 1.5,
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => canEditReporterFields && setEditingNote(true)}
            disabled={!canEditReporterFields}
            style={{
              all: 'unset',
              display: 'block',
              width: '100%',
              padding: '0.75rem',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              cursor: canEditReporterFields ? 'pointer' : 'default',
              fontSize: '0.9375rem',
              color: note ? 'var(--text-primary)' : 'var(--text-secondary)',
              lineHeight: 1.5,
              boxSizing: 'border-box',
              minHeight: '2.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {note || (canEditReporterFields ? 'Notiz zu diesem Stück…' : 'Keine Notiz')}
          </button>
        )}
        {savingNote && (
          <Loader2
            size={14}
            aria-label="Wird gespeichert"
            style={{
              position: 'absolute',
              top: '0.875rem',
              right: '1.75rem',
              color: 'var(--text-secondary)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
      </div>

      {/* Aktionsleiste */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.5rem 1rem 0',
          borderTop: '1px solid var(--border-default)',
          marginTop: '0.25rem',
        }}
      >
        {onShare && (
          <ActionButton icon={<Share2 size={16} />} label="Teilen" onClick={onShare} />
        )}
        {canEdit && onEdit && (
          <ActionButton icon={<Pencil size={16} />} label="Bearbeiten" onClick={onEdit} />
        )}
        {canDelete && onDelete && (
          <ActionButton
            icon={<Trash2 size={16} />}
            label="Löschen"
            onClick={onDelete}
            variant="danger"
          />
        )}
      </div>
    </div>
  )
}

function Hero({
  wildArt,
  photoUrl,
  photoCount,
}: {
  wildArt: string
  photoUrl?: string | null
  photoCount: number
}) {
  if (photoUrl) {
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 2',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'var(--bg-sunken)',
          marginTop: '0.25rem',
        }}
      >
        <img
          src={photoUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {photoCount > 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: '0.5rem',
              right: '0.5rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#FFFFFF',
              background: 'rgba(0, 0, 0, 0.55)',
              borderRadius: '999px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            1 / {photoCount}
          </div>
        )}
      </div>
    )
  }
  const Icon = getSpeciesIcon(wildArt)
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '3 / 2',
        borderRadius: '12px',
        background: 'var(--surface-hero)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '0.25rem',
        color: 'var(--accent-primary)',
      }}
    >
      <Icon size={120} />
    </div>
  )
}

function MetaChip({
  icon,
  label,
  italic,
}: {
  icon: React.ReactNode
  label: string
  italic?: boolean
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.625rem',
        background: 'var(--bg-sunken)',
        borderRadius: '999px',
        fontSize: '0.8125rem',
        color: 'var(--text-primary)',
        fontStyle: italic ? 'italic' : 'normal',
      }}
    >
      <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}>{icon}</span>
      {label}
    </div>
  )
}

function MiniMap({ latLng }: { latLng: LatLng }) {
  // Statisches OpenStreetMap-Tile via Bildvorschau. Echte Karte mit Marker
  // kommt in Sprint 58.1h.e zusammen mit dem Streckenkarten-Export.
  const zoom = 15
  const { lat, lng } = latLng
  const lat2tile = (l: number, z: number) =>
    Math.floor((1 - Math.log(Math.tan((l * Math.PI) / 180) + 1 / Math.cos((l * Math.PI) / 180)) / Math.PI) / 2 * 2 ** z)
  const lng2tile = (l: number, z: number) => Math.floor(((l + 180) / 360) * 2 ** z)
  const tileX = lng2tile(lng, zoom)
  const tileY = lat2tile(lat, zoom)
  const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`

  return (
    <div style={{ padding: '0 1rem' }}>
      <div
        style={{
          position: 'relative',
          height: '6.25rem',
          borderRadius: '10px',
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
          background: `var(--bg-sunken) url(${tileUrl}) center / cover`,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -100%)',
            color: 'var(--alert-text)',
            fontSize: '1.25rem',
            textShadow: '0 1px 2px rgba(255, 255, 255, 0.7)',
          }}
        >
          📍
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}) {
  const isDanger = variant === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-ripple"
      style={{
        all: 'unset',
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.375rem',
        padding: '0.75rem 0.5rem',
        background: 'var(--bg-base)',
        border: `1px solid ${isDanger ? 'var(--alert-border)' : 'var(--border-default)'}`,
        borderRadius: '10px',
        color: isDanger ? 'var(--alert-text)' : 'var(--text-primary)',
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        boxSizing: 'border-box',
        minHeight: '2.75rem',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
