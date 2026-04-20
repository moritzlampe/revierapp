'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parsePointHex } from '@/lib/geo-utils'
import { getAvatarColor } from '@/lib/avatar-color'

export interface ParticipantPosition {
  participantId: string
  name: string
  role: string
  tags: string[]
  position: { lat: number; lng: number }
  accuracy: number | null
  isLocked: boolean
  updatedAt: Date
  isCurrentUser: boolean
  avatarColor: string
}

interface HuntParticipant {
  id: string
  user_id: string | null
  guest_name: string | null
  role: string
  tags: string[]
  profiles: { display_name: string } | null
}

interface RawPosition {
  participantId: string
  lat: number
  lng: number
  accuracy: number | null
  isLocked: boolean
  updatedAt: Date
}

function getName(p: HuntParticipant): string {
  return p.profiles?.display_name || p.guest_name || 'Unbekannt'
}

export function useHuntPositions(
  huntId: string | null,
  participants: HuntParticipant[],
  currentUserId: string | null,
): ParticipantPosition[] {
  const [rawPositions, setRawPositions] = useState<Map<string, RawPosition>>(new Map())
  const supabase = useMemo(() => createClient(), [])
  const participantsRef = useRef(participants)
  participantsRef.current = participants

  // Initiales Laden aller aktuellen Positionen
  useEffect(() => {
    if (!huntId) return

    async function fetchPositions() {
      const { data, error } = await supabase
        .from('positions_current')
        .select('*')
        .eq('hunt_id', huntId)

      if (error || !data) return

      const newPositions = new Map<string, RawPosition>()
      for (const row of data) {
        const coords = parsePointHex(row.location)
        if (!coords) continue

        newPositions.set(row.participant_id, {
          participantId: row.participant_id,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: row.accuracy,
          isLocked: row.is_locked ?? false,
          updatedAt: new Date(row.updated_at),
        })
      }
      setRawPositions(newPositions)
    }

    fetchPositions()
  }, [huntId, supabase])

  // Realtime Subscription
  useEffect(() => {
    if (!huntId) return

    const channel = supabase
      .channel(`hunt-positions-${huntId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'positions_current',
        filter: `hunt_id=eq.${huntId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as Record<string, unknown>)?.participant_id as string | undefined
          if (oldId) {
            setRawPositions(prev => {
              const next = new Map(prev)
              next.delete(oldId)
              return next
            })
          }
          return
        }

        const row = payload.new as Record<string, unknown>
        const coords = parsePointHex(row.location as string)
        if (!coords) return

        setRawPositions(prev => {
          const next = new Map(prev)
          next.set(row.participant_id as string, {
            participantId: row.participant_id as string,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: row.accuracy as number | null,
            isLocked: (row.is_locked as boolean) ?? false,
            updatedAt: new Date(row.updated_at as string),
          })
          return next
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [huntId, supabase])

  // Stale-Refresh: jede Minute Referenz erneuern für isStale-Berechnung im Rendering
  useEffect(() => {
    const interval = setInterval(() => {
      setRawPositions(prev => new Map(prev))
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Raw-Positionen mit Teilnehmer-Daten anreichern (reagiert auf participants + positions)
  const otherPositions = useMemo(() => {
    return Array.from(rawPositions.values())
      .map(raw => {
        const p = participantsRef.current.find(p => p.id === raw.participantId)
        if (!p) return null
        const isCurrentUser = p.user_id === currentUserId

        return {
          participantId: raw.participantId,
          name: getName(p),
          role: p.role,
          tags: p.tags || [],
          position: { lat: raw.lat, lng: raw.lng },
          accuracy: raw.accuracy,
          isLocked: raw.isLocked,
          updatedAt: raw.updatedAt,
          isCurrentUser,
          avatarColor: getAvatarColor(raw.participantId),
        } as ParticipantPosition
      })
      .filter((p): p is ParticipantPosition => p !== null && !p.isCurrentUser)
  }, [rawPositions, participants, currentUserId])

  return otherPositions
}
