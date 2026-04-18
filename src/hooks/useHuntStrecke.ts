'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Kill } from '@/lib/types/kill'
import type { HuntPhoto } from '@/lib/types/hunt-photo'

interface UseHuntStreckeResult {
  kills: Kill[]         // ASC nach created_at
  photos: HuntPhoto[]   // DESC nach created_at (neueste zuerst)
  loading: boolean
  error: Error | null
}

/**
 * Konsolidierter Hook für den Strecke-Tab: lädt Kills + Fotos einer
 * Jagd und abonniert beide Tabellen auf EINEM Realtime-Channel
 * (hunt-strecke-${huntId}).
 *
 * useHuntKills bleibt daneben bestehen für andere Konsumenten
 * (Schusstagebuch, Statistik o.ä.).
 */
export function useHuntStrecke(huntId: string | null): UseHuntStreckeResult {
  const supabase = useMemo(() => createClient(), [])
  const [kills, setKills] = useState<Kill[]>([])
  const [photos, setPhotos] = useState<HuntPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!huntId) return

    let cancelled = false

    async function fetchBoth() {
      const [killsRes, photosRes] = await Promise.all([
        supabase
          .from('kills')
          .select('*')
          .eq('hunt_id', huntId)
          .order('created_at', { ascending: true }),
        supabase
          .from('hunt_photos')
          .select('*')
          .eq('hunt_id', huntId)
          .order('created_at', { ascending: false }),
      ])

      if (cancelled) return

      if (killsRes.error) {
        setError(new Error(killsRes.error.message))
        setKills([])
      } else {
        setKills((killsRes.data ?? []) as Kill[])
      }

      if (photosRes.error) {
        setError(new Error(photosRes.error.message))
        setPhotos([])
      } else {
        setPhotos((photosRes.data ?? []) as HuntPhoto[])
      }

      setLoading(false)
    }

    fetchBoth()

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hunt_photos',
          filter: `hunt_id=eq.${huntId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPhoto = payload.new as HuntPhoto
            setPhotos(prev => {
              if (prev.some(p => p.id === newPhoto.id)) return prev
              return [newPhoto, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as HuntPhoto
            setPhotos(prev => prev.map(p => (p.id === updated.id ? updated : p)))
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as Record<string, unknown>)?.id as string | undefined
            if (oldId) setPhotos(prev => prev.filter(p => p.id !== oldId))
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [huntId, supabase])

  return { kills, photos, loading, error }
}
