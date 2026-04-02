'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [einladungscode, setEinladungscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Client-seitige Einladungscode-Prüfung
    const gueltigerCode = (process.env.NEXT_PUBLIC_INVITE_CODE || 'Felsenkeller2026')
    if (einladungscode.toLowerCase() !== gueltigerCode.toLowerCase()) {
      setError('Ungültiger Einladungscode')
      setLoading(false)
      return
    }

    if (password.length < 6) { setError('Passwort muss mindestens 6 Zeichen haben.'); setLoading(false); return }

    // Server-seitige Einladungscode-Prüfung
    const res = await fetch('/api/validate-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: einladungscode }),
    })
    if (!res.ok) {
      setError('Ungültiger Einladungscode')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } },
    })

    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true); setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>E-Mail prüfen</h1>
          <p className="mb-6" style={{ color: 'var(--text-2)' }}>
            Bestätigungslink an <strong style={{ color: 'var(--text)' }}>{email}</strong> geschickt.
          </p>
          <Link href="/login" className="font-medium" style={{ color: 'var(--green-bright)' }}>Zurück zum Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, var(--green), var(--green-dim))' }}>🌲</div>
          <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Revier<span style={{ color: 'var(--green-bright)' }}>App</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Konto erstellen</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-2)' }}>Kostenlos registrieren. Erste Jagd gratis.</p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoComplete="name" placeholder="Moritz Lampe" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>E-Mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="moritz@beispiel.de" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Passwort</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" placeholder="Mindestens 6 Zeichen" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Einladungscode</label>
            <input type="text" value={einladungscode} onChange={(e) => setEinladungscode(e.target.value)} required autoComplete="off" placeholder="Code eingeben" />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

          <button type="submit" disabled={loading} className="w-full font-semibold text-base transition disabled:opacity-50"
            style={{ height: '3rem', borderRadius: 'var(--radius)', background: 'linear-gradient(135deg, var(--green), #4a7a25)', color: 'white', boxShadow: '0 0.25rem 1.25rem rgba(107,159,58,0.25)' }}>
            {loading ? 'Wird erstellt...' : 'Registrieren'}
          </button>
        </form>

        <p className="text-sm text-center mt-6" style={{ color: 'var(--text-3)' }}>
          Schon ein Konto?{' '}
          <Link href="/login" className="font-medium" style={{ color: 'var(--green-bright)' }}>Anmelden</Link>
        </p>
      </div>
    </div>
  )
}
