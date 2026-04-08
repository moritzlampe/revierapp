'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRight,
  Copy,
  UserPlus,
  MapPin,
  Bell,
  Palette,
  Mail,
  Lock,
  LogOut,
  X,
  Camera,
} from 'lucide-react'
import BottomTabBar from '@/components/bottom-tab-bar'

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
  districts: { id: string; name: string }[]
}

export default function DuContent({
  userId,
  email,
  displayName,
  avatarUrl,
  initialStatus,
  districts,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<Status>(initialStatus as Status)
  const [showInviteSheet, setShowInviteSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Scroll-Bereich mit Platz für Tab-Bar */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(3.5rem + var(--safe-bottom) + 1rem)' }}>

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
              <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--green-bright)' }}>
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
                  color: status === key ? 'var(--green-bright)' : 'var(--text-3)',
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
          <MenuItem
            icon={<UserPlus size={18} />}
            label="Freunde einladen"
            onClick={() => setShowInviteSheet(true)}
          />
          <MenuItem
            icon={<MapPin size={18} />}
            label="Verknüpfte Reviere"
            sublabel={districts.length > 0
              ? districts.map(d => d.name).join(', ')
              : 'Keine Reviere verknüpft'
            }
          />
        </Section>

        {/* === Sektion: Einstellungen === */}
        <Section title="Einstellungen">
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
                color: 'var(--green-bright)',
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
          bottom: 'calc(3.5rem + var(--safe-bottom) + 1rem)',
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

      <BottomTabBar />
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
        fontSize: '0.6875rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05rem',
        color: 'var(--text-3)',
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
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onClick?: () => void
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
      <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </Tag>
  )
}
