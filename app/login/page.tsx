'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-Mail oder Passwort stimmt nicht.')
      setLoading(false)
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, var(--green), var(--green-dim))' }}>🌲</div>
          <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Revier<span style={{ color: 'var(--accent-primary)' }}>App</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Anmelden</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-2)' }}>Willkommen zurück.</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>E-Mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="moritz@beispiel.de" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Passwort</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

          <button type="submit" disabled={loading} className="w-full font-semibold text-base transition disabled:opacity-50"
            style={{ height: '3rem', borderRadius: 'var(--radius)', background: 'linear-gradient(135deg, var(--green), #4a7a25)', color: 'white', boxShadow: '0 0.25rem 1.25rem rgba(107,159,58,0.25)' }}>
            {loading ? 'Wird angemeldet...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-sm text-center mt-6" style={{ color: 'var(--text-3)' }}>
          Noch kein Konto?{' '}
          <Link href="/signup" className="font-medium" style={{ color: 'var(--accent-primary)' }}>Registrieren</Link>
        </p>
      </div>
    </div>
  )
}
