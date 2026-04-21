'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye } from '@phosphor-icons/react'

type Props = {
  userId: string
  initialAnonymizeKills: boolean
}

export default function JagdeinstellungenContent({ userId, initialAnonymizeKills }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [anonymizeKills, setAnonymizeKills] = useState(initialAnonymizeKills)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  async function handleToggleAnonymize(next: boolean) {
    const prev = anonymizeKills
    setAnonymizeKills(next)
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({ anonymize_kills: next })
      .eq('id', userId)

    setSaving(false)

    if (error) {
      setAnonymizeKills(prev)
      showToast('Fehler beim Speichern')
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          minHeight: '3.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push('/app/du')}
          aria-label="Zurück"
          className="flex items-center justify-center rounded-lg"
          style={{
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            fontSize: '1.125rem',
          }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Jagdeinstellungen</h1>
      </div>

      {/* Scroll-Bereich */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: '1.25rem', paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
      >
        <Section title="Privatsphäre">
          <ToggleRow
            icon={<Eye size={18} />}
            label="Name in Strecke anonymisieren"
            sublabel={
              'Andere Schützen sehen deinen Namen als „Jäger". ' +
              'Wenn aktiv, siehst du ebenfalls alle anderen anonym. ' +
              'Jagdleiter sehen immer alle Namen.'
            }
            value={anonymizeKills}
            onChange={handleToggleAnonymize}
            disabled={saving}
          />
        </Section>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(var(--safe-bottom) + 1rem)',
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

function ToggleRow({
  icon,
  label,
  sublabel,
  value,
  onChange,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      role="switch"
      aria-checked={value}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        textAlign: 'left',
        minHeight: '2.75rem',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        background: 'transparent',
      }}
    >
      <span style={{ color: 'var(--text-2)', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '0.9375rem', fontWeight: 500, display: 'block' }}>{label}</span>
        {sublabel && (
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--text-3)',
            marginTop: '0.25rem',
            lineHeight: 1.4,
          }}>
            {sublabel}
          </p>
        )}
      </div>
      <span style={{
        flexShrink: 0,
        width: '2.5rem',
        height: '1.5rem',
        borderRadius: '0.75rem',
        background: value ? 'var(--green-dim)' : 'var(--surface-3)',
        position: 'relative',
        transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute',
          top: '0.125rem',
          left: value ? '1.125rem' : '0.125rem',
          width: '1.25rem',
          height: '1.25rem',
          borderRadius: '50%',
          background: value ? 'var(--accent-primary)' : 'var(--text-3)',
          transition: 'left 0.15s, background 0.15s',
        }} />
      </span>
    </button>
  )
}
