'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import SwipeToAction from '@/components/ui/swipe-to-action'
import {
  CaretRight as ChevronRight,
  CaretDown,
  Copy,
  UserPlus,
  MapPin,
  Bell,
  Palette,
  EnvelopeSimple as Mail,
  EnvelopeOpen,
  Lock,
  SignOut as LogOut,
  X,
  Camera,
  Eye,
  EyeSlash,
  Notebook,
} from '@phosphor-icons/react'
type Status = 'available' | 'on_hunt' | 'do_not_disturb'

const STATUS_OPTIONS: { key: Status; label: string }[] = [
  { key: 'available', label: 'Verfügbar' },
  { key: 'on_hunt', label: 'Auf Jagd' },
  { key: 'do_not_disturb', label: 'Nicht stören' },
]

type Props = {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
  initialStatus: string
  districts: { id: string; name: string; hidden: boolean }[]
  invitationCount: number
}

export default function DuContent({
  userId,
  email,
  displayName,
  avatarUrl,
  initialStatus,
  districts,
  invitationCount,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<Status>(initialStatus as Status)
  const [showInviteSheet, setShowInviteSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  // Offenen Swipe schliessen, sobald ein anderer aufgeht (ein offener Eintrag gleichzeitig)
  const activeCloseRef = useRef<(() => void) | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  // Verfügbarkeitsstatus ändern
  const updateStatus = useCallback(async (newStatus: Status) => {
    const prev = status
    setStatus(newStatus) // optimistisch
    const { error } = await supabase
      .from('profiles')
      .update({ availability_status: newStatus })
      .eq('id', userId)
    if (error) {
      setStatus(prev) // Rollback
      showToast('Fehler beim Speichern')
    }
  }, [supabase, userId, status])

  // Revier ausblenden (soft-hide, reversibel — kein Datenverlust)
  const handleHideDistrict = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('districts')
      .update({ hidden: true })
      .eq('id', id)
    if (error) {
      console.error('Revier ausblenden fehlgeschlagen:', error.message)
      showToast('Fehler beim Ausblenden')
      return
    }
    router.refresh()
  }, [supabase, router])

  // Revier wieder einblenden
  const handleUnhideDistrict = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('districts')
      .update({ hidden: false })
      .eq('id', id)
    if (error) {
      console.error('Revier einblenden fehlgeschlagen:', error.message)
      showToast('Fehler beim Einblenden')
      return
    }
    router.refresh()
  }, [supabase, router])

  // Abmelden
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Einladungscode kopieren
  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText('Felsenkeller2026')
      showToast('Code kopiert!')
    } catch {
      showToast('Kopieren fehlgeschlagen')
    }
  }

  // Initialen für Avatar-Fallback
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  // Reviere clientseitig in sichtbar / ausgeblendet splitten (eine Query)
  const visibleDistricts = districts.filter(d => !d.hidden)
  const hiddenDistricts = districts.filter(d => d.hidden)

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Scroll-Bereich mit Platz für Tab-Bar */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(var(--bottom-bar-space) + 1rem)' }}>

        {/* === Profil-Header === */}
        <div style={{ padding: '2rem 1.25rem 1.5rem', textAlign: 'center' }}>
          {/* Profilbild */}
          <button
            onClick={() => showToast('Bald verfügbar')}
            style={{
              width: '6rem',
              height: '6rem',
              borderRadius: '50%',
              margin: '0 auto 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              background: avatarUrl ? 'transparent' : 'var(--green-dim)',
              border: '2px solid var(--green)',
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {initials}
              </span>
            )}
            {/* Kamera-Overlay */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2rem',
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Camera size={14} style={{ color: 'white' }} />
            </div>
          </button>

          {/* Name + E-Mail */}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            {displayName}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-3)' }}>
            {email}
          </p>
        </div>

        {/* === Verfügbarkeitsstatus === */}
        <div style={{ padding: '0 1.25rem 1.5rem' }}>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            padding: '0.25rem',
          }}>
            {STATUS_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => updateStatus(key)}
                style={{
                  flex: 1,
                  padding: '0.625rem 0.5rem',
                  borderRadius: '0.625rem',
                  fontSize: '0.8125rem',
                  fontWeight: status === key ? 700 : 500,
                  background: status === key ? 'var(--green-dim)' : 'transparent',
                  color: status === key ? 'var(--accent-primary)' : 'var(--text-3)',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* === Sektion: QuickHunt === */}
        <Section title="QuickHunt">
          {invitationCount > 0 && (
            <Link href="/app/du/einladungen" style={{ textDecoration: 'none', color: 'inherit' }}>
              <MenuItem
                icon={<EnvelopeOpen size={18} />}
                label="Einladungen"
                sublabel={`${invitationCount} offen`}
                badge={invitationCount}
              />
            </Link>
          )}
          <MenuItem
            icon={<UserPlus size={18} />}
            label="Freunde einladen"
            onClick={() => setShowInviteSheet(true)}
          />
          {visibleDistricts.length > 0 ? (
            visibleDistricts.map(d => (
              <SwipeToAction
                key={d.id}
                actionIcon={<EyeSlash size={22} weight="regular" color="#fff" />}
                actionColor="var(--text-muted)"
                onAction={() => handleHideDistrict(d.id)}
                onSwipeOpen={(closeFn) => {
                  if (activeCloseRef.current && activeCloseRef.current !== closeFn) {
                    activeCloseRef.current()
                  }
                  activeCloseRef.current = closeFn
                }}
              >
                {/* Opaker Hintergrund (var(--surface)) deckt den var(--bg) des
                    Swipe-Containers, damit der Eintrag in die Card-Optik passt */}
                <Link href={`/app/du/revier/${d.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <MenuItem
                    icon={<MapPin size={18} />}
                    label={d.name}
                    sublabel="Revier-Einstellungen"
                    background="var(--surface)"
                  />
                </Link>
              </SwipeToAction>
            ))
          ) : (
            <MenuItem
              icon={<MapPin size={18} />}
              label="Verknüpfte Reviere"
              sublabel={hiddenDistricts.length > 0 ? 'Alle Reviere ausgeblendet' : 'Keine Reviere verknüpft'}
            />
          )}
        </Section>

        {/* === Ausgeblendete Reviere (nur wenn vorhanden) === */}
        {hiddenDistricts.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              onClick={() => setShowHidden(v => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0 1.25rem',
                marginBottom: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                minHeight: '2.25rem',
              }}
            >
              <CaretDown
                size={16}
                style={{
                  color: 'var(--text-3)',
                  transform: showHidden ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-3)' }}>
                Ausgeblendete ({hiddenDistricts.length})
              </span>
            </button>
            {showHidden && (
              <div style={{
                margin: '0 1.25rem',
                background: 'var(--surface)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                opacity: 0.75,
              }}>
                {hiddenDistricts.map(d => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.875rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      minHeight: '2.75rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                      <MapPin size={18} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.9375rem', fontWeight: 500, color: 'var(--text-2)' }}>
                      {d.name}
                    </span>
                    <button
                      onClick={() => handleUnhideDistrict(d.id)}
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-2)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        minHeight: '2.25rem',
                      }}
                    >
                      <Eye size={16} />
                      Einblenden
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === Sektion: Jagdtagebuch === */}
        <Section title="Jagdtagebuch">
          <Link href="/app/du/tagebuch" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MenuItem
              icon={<Notebook size={18} />}
              label="Jagdtagebuch"
            />
          </Link>
        </Section>

        {/* === Sektion: Einstellungen === */}
        <Section title="Einstellungen">
          <Link href="/app/du/jagdeinstellungen" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MenuItem
              icon={<Eye size={18} />}
              label="Jagdeinstellungen"
              sublabel="Privatsphäre, Standardwerte"
            />
          </Link>
          <MenuItem
            icon={<Bell size={18} />}
            label="Benachrichtigungen"
            onClick={() => showToast('Bald verfügbar')}
          />
          <MenuItem
            icon={<Palette size={18} />}
            label="Erscheinungsbild"
            onClick={() => showToast('Bald verfügbar')}
          />
        </Section>

        {/* === Sektion: Konto === */}
        <Section title="Konto">
          <MenuItem
            icon={<Mail size={18} />}
            label="E-Mail ändern"
            onClick={() => showToast('Bald verfügbar')}
          />
          <MenuItem
            icon={<Lock size={18} />}
            label="Passwort ändern"
            onClick={() => showToast('Bald verfügbar')}
          />
        </Section>

        {/* Abmelden-Button */}
        <div style={{ padding: '0.5rem 1.25rem 2rem' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: 'var(--radius)',
              fontSize: '0.9375rem',
              fontWeight: 700,
              color: 'var(--red)',
              background: 'rgba(239,83,80,0.1)',
              border: '1px solid rgba(239,83,80,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              minHeight: '2.75rem',
            }}
          >
            <LogOut size={18} />
            Abmelden
          </button>
        </div>
      </div>

      {/* === Einladen-Sheet === */}
      {showInviteSheet && (
        <div
          onClick={() => setShowInviteSheet(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '24rem',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius)',
              padding: '1.5rem',
              marginBottom: 'calc(var(--safe-bottom) + 0.5rem)',
            }}
          >
            {/* Sheet-Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Freunde einladen</h3>
              <button
                onClick={() => setShowInviteSheet(false)}
                style={{ color: 'var(--text-3)', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
              Teile diesen Code, damit Freunde der RevierApp beitreten können.
            </p>

            {/* Einladungscode */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'var(--bg)',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1rem',
            }}>
              <span style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.05rem',
                color: 'var(--accent-primary)',
              }}>
                Felsenkeller2026
              </span>
              <button
                onClick={copyInviteCode}
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  background: 'var(--surface-2)',
                  color: 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '2.75rem',
                  minHeight: '2.75rem',
                }}
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Toast === */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(var(--bottom-bar-space) + 1rem)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-3)',
          color: 'var(--text)',
          padding: '0.625rem 1.25rem',
          borderRadius: '0.75rem',
          fontSize: '0.8125rem',
          fontWeight: 600,
          zIndex: 200,
          boxShadow: '0 0.25rem 1rem rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

    </div>
  )
}

/* === Hilfskomponenten === */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <p style={{
        padding: '0 1.25rem',
        marginBottom: '0.5rem',
        fontFamily: 'var(--font-display)',
        fontSize: '1.125rem',
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: 'var(--text)',
      }}>
        {title}
      </p>
      <div style={{
        margin: '0 1.25rem',
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  sublabel,
  onClick,
  badge,
  background,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onClick?: () => void
  badge?: number
  background?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--border)',
        textAlign: 'left',
        minHeight: '2.75rem',
        cursor: onClick ? 'pointer' : 'default',
        background,
      }}
    >
      <span style={{ color: 'var(--text-2)', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{label}</span>
        {sublabel && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.125rem' }}>
            {sublabel}
          </p>
        )}
      </div>
      {badge != null && badge > 0 && (
        <span className="flex items-center justify-center flex-shrink-0" style={{
          minWidth: '1.25rem', height: '1.25rem', borderRadius: '0.625rem',
          background: 'var(--green)', color: 'white',
          fontSize: '0.6875rem', fontWeight: 700, padding: '0 0.3125rem',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </Tag>
  )
}
