'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Crosshair, Target, MessageSquare, User } from 'lucide-react'
import { ErlegungSheet } from '@/components/erlegung/ErlegungSheet'

const linkTabs = [
  { key: 'jagd', label: 'Jagd', icon: Crosshair, href: '/app?tab=jagden' },
  // Erlegung wird separat gerendert (Action-Button, kein Link)
  { key: 'chat', label: 'Chat', icon: MessageSquare, href: '/app?tab=chats' },
  { key: 'du', label: 'Du', icon: User, href: '/app/du' },
] as const

// Vollbild-Aktionen: Tab-Bar ausblenden
const HIDE_ON_ROUTES = ['/app/hunt/create']

export default function BottomTabBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [erlegungOpen, setErlegungOpen] = useState(false)

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

  // Aktiven Tab bestimmen
  let activeKey: string
  if (pathname === '/app/du') {
    activeKey = 'du'
  } else if (pathname.startsWith('/app/hunt/') || pathname.startsWith('/app/hunt')) {
    activeKey = 'jagd'
  } else if (pathname.startsWith('/app/chat/') || pathname.startsWith('/app/chat')) {
    activeKey = 'chat'
  } else if (pathname === '/app') {
    activeKey = searchParams.get('tab') === 'chats' ? 'chat' : 'jagd'
  } else {
    activeKey = 'jagd' // Fallback
  }

  return (
    <>
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
          ...(keyboardOpen ? {
            visibility: 'hidden' as const,
            pointerEvents: 'none' as const,
            opacity: 0,
          } : {}),
        }}
      >
        <div style={{ display: 'flex', height: '3.5rem' }}>
          {/* Tab 1: Jagd */}
          {renderLinkTab(linkTabs[0], activeKey)}

          {/* Tab 2: Erlegung (Action-Button) */}
          <button
            onClick={() => setErlegungOpen(true)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.125rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              minHeight: '2.75rem',
              minWidth: '2.75rem',
              color: erlegungOpen ? '#fff' : 'var(--text-3)',
              transition: 'color 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2.25rem',
                height: '2.25rem',
                borderRadius: '50%',
                background: 'var(--green)',
                color: '#fff',
                transition: 'opacity 0.15s',
                opacity: erlegungOpen ? 0.8 : 1,
              }}
            >
              <Target size={20} strokeWidth={2.2} />
            </span>
            <span style={{
              fontSize: '0.625rem',
              fontWeight: erlegungOpen ? 700 : 500,
              color: erlegungOpen ? 'var(--green-bright)' : 'var(--text-3)',
            }}>
              Erlegung
            </span>
          </button>

          {/* Tab 3: Chat */}
          {renderLinkTab(linkTabs[1], activeKey)}

          {/* Tab 4: Du */}
          {renderLinkTab(linkTabs[2], activeKey)}
        </div>
      </nav>

      <ErlegungSheet open={erlegungOpen} onOpenChange={setErlegungOpen} />
    </>
  )
}

function renderLinkTab(
  tab: { key: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; href: string },
  activeKey: string,
) {
  const isActive = activeKey === tab.key
  return (
    <Link
      key={tab.key}
      href={tab.href}
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
      <tab.icon
        size={22}
        strokeWidth={isActive ? 2.5 : 1.8}
      />
      <span style={{ fontSize: '0.625rem', fontWeight: isActive ? 700 : 500 }}>
        {tab.label}
      </span>
    </Link>
  )
}
