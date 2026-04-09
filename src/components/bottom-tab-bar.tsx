'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Crosshair, MessageSquare, User } from 'lucide-react'

const tabs = [
  { key: 'jagden', label: 'Jagden', icon: Crosshair, href: '/app?tab=jagden' },
  { key: 'chats', label: 'Chats', icon: MessageSquare, href: '/app?tab=chats' },
  { key: 'du', label: 'Du', icon: User, href: '/app/du' },
] as const

// Vollbild-Aktionen: Tab-Bar ausblenden
const HIDE_ON_ROUTES = ['/app/hunt/create']

export default function BottomTabBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  // Keyboard-Visibility via Custom Event (Chat-Inputs dispatchen diese)
  useEffect(() => {
    const handler = (e: Event) => {
      const open = (e as CustomEvent).detail?.open ?? false
      setKeyboardOpen(open)
    }
    window.addEventListener('quickhunt:keyboard', handler)
    return () => window.removeEventListener('quickhunt:keyboard', handler)
  }, [])

  // Auf bestimmten Routes komplett ausblenden
  if (HIDE_ON_ROUTES.some(r => pathname.startsWith(r))) return null

  // Bei offener Tastatur ausblenden
  if (keyboardOpen) return null

  // Aktiven Tab bestimmen
  let activeKey: string
  if (pathname === '/app/du') {
    activeKey = 'du'
  } else if (pathname.startsWith('/app/hunt/') || pathname.startsWith('/app/hunt')) {
    activeKey = 'jagden'
  } else if (pathname.startsWith('/app/chat/') || pathname.startsWith('/app/chat')) {
    activeKey = 'chats'
  } else if (pathname === '/app') {
    activeKey = searchParams.get('tab') === 'chats' ? 'chats' : 'jagden'
  } else {
    activeKey = 'jagden' // Fallback
  }

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <div style={{ display: 'flex', height: '3.5rem' }}>
        {tabs.map(({ key, label, icon: Icon, href }) => {
          const isActive = activeKey === key
          return (
            <Link
              key={key}
              href={href}
              prefetch={true}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.125rem',
                textDecoration: 'none',
                color: isActive ? 'var(--green-bright)' : 'var(--text-3)',
                transition: 'color 0.15s',
                minHeight: '2.75rem',
                minWidth: '2.75rem',
              }}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span style={{ fontSize: '0.625rem', fontWeight: isActive ? 700 : 500 }}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
