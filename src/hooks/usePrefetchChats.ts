'use client'

import { useEffect, useRef } from 'react'
import { useChatCache } from '@/contexts/ChatCacheContext'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_PREFETCH = 10
const PAGE_SIZE = 20

/**
 * Lädt im Hintergrund die letzten 20 Nachrichten der ersten 10 Chats
 * und schreibt sie in den ChatCacheContext.
 * Fire-and-forget — blockiert die UI nicht.
 */
export function usePrefetchChats(
  supabase: SupabaseClient,
  groupIds: string[],
) {
  const chatCache = useChatCache()
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current || groupIds.length === 0) return
    didRun.current = true

    const prefetch = async () => {
      // Nur die ersten 10, und nur die die noch nicht im Cache sind
      const toPrefetch = groupIds
        .slice(0, MAX_PREFETCH)
        .filter(id => !chatCache.get(id))

      if (toPrefetch.length === 0) return

      // Parallel laden
      await Promise.all(
        toPrefetch.map(async (groupId) => {
          try {
            const { data } = await supabase
              .from('messages')
              .select('*')
              .eq('group_id', groupId)
              .order('created_at', { ascending: false })
              .limit(PAGE_SIZE)

            if (data && data.length > 0) {
              // Cache erwartet chronologische Reihenfolge (älteste zuerst)
              const sorted = data.reverse()
              chatCache.set(groupId, sorted)
            }
          } catch {
            // Fehler beim Vorladen ignorieren — kein User-Impact
          }
        })
      )
    }

    // Erst UI fertig rendern lassen, dann im Hintergrund laden
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => prefetch())
    } else {
      setTimeout(() => prefetch(), 100)
    }
  }, [supabase, groupIds, chatCache])
}
