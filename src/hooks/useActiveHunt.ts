'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ActiveHunt {
  id: string
  name: string
  type: string
  district_id: string | null
  started_at: string
}

/**
 * Liefert die aktuell aktive Hunt des eingeloggten Users (status='active'),
 * oder null wenn keine aktiv.
 * Bei mehreren aktiven Hunts: jüngste gewinnt.
 */
export function useActiveHunt() {
  const [activeHunt, setActiveHunt] = useState<ActiveHunt | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (mounted) { setActiveHunt(null); setLoading(false) }
        return
      }

      const { data } = await supabase
        .from('hunts')
        .select('id, name, type, district_id, started_at, hunt_participants!inner(user_id)')
        .eq('status', 'active')
        .eq('hunt_participants.user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (mounted) {
        setActiveHunt(data ? {
          id: data.id,
          name: data.name,
          type: data.type,
          district_id: data.district_id,
          started_at: data.started_at,
        } : null)
        setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  return { activeHunt, loading }
}
