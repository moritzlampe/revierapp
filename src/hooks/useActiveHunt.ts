'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export interface ActiveHunt {
  id: string
  name: string
  type: string
  kind: 'group' | 'solo'
  district_id: string | null
  started_at: string
  last_activity_at: string | null
}

/**
 * Liefert die aktuell aktive Hunt des eingeloggten Users (status='active'),
 * oder null wenn keine aktiv.
 * Bei mehreren aktiven Hunts: jüngste gewinnt.
 *
 * Re-fetch bei Route-Wechsel (z.B. nach endHunt → router.push('/app'))
 * und wenn der Tab wieder sichtbar wird, damit `activeHunt` nicht auf
 * einer beendeten Jagd stehen bleibt, solange das Layout gemountet ist.
 */
export function useActiveHunt() {
  const [activeHunt, setActiveHunt] = useState<ActiveHunt | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setActiveHunt(null)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('hunts')
        .select('id, name, type, kind, district_id, started_at, last_activity_at, hunt_participants!inner(user_id)')
        .eq('status', 'active')
        .eq('hunt_participants.user_id', user.id)
        .eq('hunt_participants.status', 'joined')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      setActiveHunt(data ? {
        id: data.id,
        name: data.name,
        type: data.type,
        kind: (data.kind as 'group' | 'solo') ?? 'group',
        district_id: data.district_id,
        started_at: data.started_at,
        last_activity_at: data.last_activity_at ?? null,
      } : null)
      setLoading(false)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }

    load()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pathname])

  return { activeHunt, loading }
}
