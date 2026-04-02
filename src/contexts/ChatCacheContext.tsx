'use client'

import { createContext, useContext, useRef, useCallback } from 'react'

type Message = {
  id: string
  hunt_id: string | null
  group_id: string | null
  participant_id: string | null
  sender_id: string | null
  type: string
  content: string | null
  media_url: string | null
  created_at: string
}

type ChatCacheEntry = {
  messages: Message[]
  lastFetchedAt: string // created_at der neuesten Nachricht
}

type ChatCacheContextType = {
  get: (channelId: string) => ChatCacheEntry | undefined
  set: (channelId: string, messages: Message[]) => void
  append: (channelId: string, message: Message) => void
  clear: () => void
}

const ChatCacheContext = createContext<ChatCacheContextType | null>(null)

export function ChatCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<string, ChatCacheEntry>>(new Map())

  const get = useCallback((channelId: string) => {
    return cacheRef.current.get(channelId)
  }, [])

  const set = useCallback((channelId: string, messages: Message[]) => {
    if (messages.length === 0) {
      cacheRef.current.set(channelId, { messages: [], lastFetchedAt: '' })
      return
    }
    const lastMsg = messages[messages.length - 1]
    cacheRef.current.set(channelId, {
      messages: [...messages],
      lastFetchedAt: lastMsg.created_at,
    })
  }, [])

  const append = useCallback((channelId: string, message: Message) => {
    const entry = cacheRef.current.get(channelId)
    if (!entry) return
    // Duplikat vermeiden
    if (entry.messages.some(m => m.id === message.id)) return
    entry.messages.push(message)
    entry.lastFetchedAt = message.created_at
  }, [])

  const clear = useCallback(() => {
    cacheRef.current.clear()
  }, [])

  return (
    <ChatCacheContext.Provider value={{ get, set, append, clear }}>
      {children}
    </ChatCacheContext.Provider>
  )
}

export function useChatCache() {
  const ctx = useContext(ChatCacheContext)
  if (!ctx) throw new Error('useChatCache muss innerhalb von ChatCacheProvider verwendet werden')
  return ctx
}
