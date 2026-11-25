'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    // CN-565: nur diese Sitzung — ohne Argument beendet signOut ALLE Sitzungen
    // des Kontos, auch die der App auf dem Handy, und die merkt es nicht.
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={handleLogout} className="text-sm transition" style={{ color: 'var(--text-3)' }}>
      Abmelden
    </button>
  )
}
