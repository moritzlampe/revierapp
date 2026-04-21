'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
// Target bleibt einstweilen Lucide — wird in Sprint 58.1k.3 durch BullseyeIcon ersetzt.
// Siehe docs/recon/BERICHT_58_1k_0_Recon.md (Signature-Motif).
import { Target } from 'lucide-react'
import { Crosshair, ChatCircle, User } from '@phosphor-icons/react'
import { ErlegungSheet } from '@/components/erlegung/ErlegungSheet'
import { useActiveHunt } from '@/hooks/useActiveHunt'

// Vollbild-Aktionen: Tab-Bar ausblenden
const HIDE_ON_ROUTES = ['/app/hunt/create']

export default function BottomTabBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [erlegungOpen, setErlegungOpen] = useState(false)
  const { activeHunt } = useActiveHunt()

  // Jagd-Tab: aktive Hunt → direkt dorthin, sonst Jagd-Liste
  const jagdHref = activeHunt ? `/app/hunt/${activeHunt.id}` : '/app?tab=jagden'

  const linkTabs = [
    { key: 'jagd', label: 'Jagd', icon: Crosshair, href: jagdHref },
    { key: 'chat', label: 'Chat', icon: ChatCircle, href: '/app?tab=chats' },
    { key: 'du', label: 'Du', icon: User, href: '/app/du' },
  ] as const

  // Keyboard-Visibility via Custom Event (Chat-Inputs dispatchen diese)
  useEffect(() => {
    const handler = (e: Event) => {
      const open = (e as CustomEvent).detail?.open ?? false
      setKeyboardOpen(open)
    }
    window.addEventListener('quickhunt:keyboard', handler)
    return () => window.removeEventListener('quickhunt:keyboard', handler)
  }, [])

  // Erlegung-Sheet von anderen Screens öffnen (Strecke-Tab-Empty-State).
  useEffect(() => {
    const handler = () => setErlegungOpen(true)
    window.addEventListener('quickhunt:open-erlegung', handler)
    return () => window.removeEventListener('quickhunt:open-erlegung', handler)
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
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border-default)',
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

          {/* Tab 2: Erlegung (Action-Button, Design-System §5.12: 56px FAB) */}
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
              color: erlegungOpen ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'color 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                color: 'var(--text-primary)',
                transition: 'opacity 0.15s',
                opacity: erlegungOpen ? 0.8 : 1,
                /* Leicht angehoben, damit die 56px-FAB nicht den
                   gesamten Nav-Höhe-Slot ausfüllt. */
                marginTop: '-1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              }}
            >
              <Target size={24} strokeWidth={2.2} />
            </span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: erlegungOpen ? 700 : 500,
              color: erlegungOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
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
  tab: { key: string; label: string; icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'bold' }>; href: string },
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
        color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
        transition: 'color 0.15s',
        minHeight: '2.75rem',
        minWidth: '2.75rem',
      }}
    >
      <tab.icon
        size={22}
        weight={isActive ? 'fill' : 'regular'}
      />
      <span style={{ fontSize: '0.75rem', fontWeight: isActive ? 700 : 500 }}>
        {tab.label}
      </span>
    </Link>
  )
}
