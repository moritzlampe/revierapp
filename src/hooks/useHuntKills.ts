'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { groupKillsByBatch } from '@/lib/erlegung/groupByBatch'
import type { Kill, KillBatch } from '@/lib/types/kill'

interface UseHuntKillsResult {
  kills: Kill[]            // ASC nach created_at
  batches: KillBatch[]     // Anzeige-sortiert: neuester Batch zuerst (DESC)
  loading: boolean
  error: Error | null
}

export function useHuntKills(huntId: string | null): UseHuntKillsResult {
  const supabase = useMemo(() => createClient(), [])
  const [kills, setKills] = useState<Kill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!huntId) return

    let cancelled = false

    async function fetchKills() {
      const { data, error: fetchError } = await supabase
        .from('kills')
        .select('*')
        .eq('hunt_id', huntId)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (fetchError) {
        setError(new Error(fetchError.message))
        setKills([])
      } else {
        setKills((data ?? []) as Kill[])
      }
      setLoading(false)
    }

    fetchKills()

    // Channel-Name wird in .3b wiederverwendet für hunt_photos.
    const channel = supabase
      .channel(`hunt-strecke-${huntId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kills',
          filter: `hunt_id=eq.${huntId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newKill = payload.new as Kill
            setKills(prev => {
              if (prev.some(k => k.id === newKill.id)) return prev
              // Chronologisch einsortieren (created_at ASC)
              const next = [...prev, newKill]
              next.sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              )
              return next
            })
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Kill
            setKills(prev => prev.map(k => (k.id === updated.id ? updated : k)))
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as Record<string, unknown>)?.id as string | undefined
            if (oldId) setKills(prev => prev.filter(k => k.id !== oldId))
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [huntId, supabase])

  const batches = useMemo(() => {
    // groupKillsByBatch erwartet ASC-sortierte Eingabe für die
    // 2s-Heuristik. Anzeige wollen wir DESC (neuester Batch oben).
    return groupKillsByBatch(kills).slice().reverse()
  }, [kills])

  return { kills, batches, loading, error }
}
