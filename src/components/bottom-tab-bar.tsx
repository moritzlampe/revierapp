'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import BullseyeIcon from '@/components/icons/BullseyeIcon'
import { Crosshair, ChatCircle, User, Notebook, Stack } from '@phosphor-icons/react'
import { ErlegungSheet } from '@/components/erlegung/ErlegungSheet'
import { useActiveHunt } from '@/contexts/ActiveHuntContext'
import { createClient } from '@/lib/supabase/client'

// Vollbild-Aktionen (Karten/Wizards): Tab-Bar ausblenden.
// Strings matchen per Prefix; RegExp für Routen mit dynamischer ID in der Mitte.
// Beide Revier-Karten-Routen haben einen Zurück-Button im Header, daher
// ist das Ausblenden sicher (User sitzt nicht ohne Navigation fest).
const HIDE_ON_ROUTES: (string | RegExp)[] = [
  '/app/hunt/create',
  '/app/du/revier/', // Revier-Editor (Vollbild-Karte), /app/du/revier/<id>
  /^\/app\/revier\/[^/]+\/setup/, // Revier-Setup-Wizard, /app/revier/<id>/setup
]

type ActiveKey = 'jagd' | 'tagebuchOrStrecke' | 'chat' | 'du' | null

function getActiveKey(
  pathname: string,
  searchParams: URLSearchParams,
  activeHunt: { id: string } | null,
): ActiveKey {
  // Tagebuch / Strecke — MUSS vor dem generischen /app/hunt-Check stehen,
  // sonst gewinnt bei tab=strecke immer 'jagd'.
  if (pathname === '/app/du/tagebuch') return 'tagebuchOrStrecke'
  if (
    activeHunt &&
    pathname === `/app/hunt/${activeHunt.id}` &&
    searchParams.get('tab') === 'strecke'
  ) {
    return 'tagebuchOrStrecke'
  }
  // Du
  if (pathname === '/app/du') return 'du'
  // Chat
  if (pathname.startsWith('/app/chat/')) return 'chat'
  if (pathname === '/app' && searchParams.get('tab') === 'chats') return 'chat'
  // Jagd
  if (pathname.startsWith('/app/hunt/')) return 'jagd'
  if (pathname === '/app') return 'jagd'
  return null
}

export default function BottomTabBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [erlegungOpen, setErlegungOpen] = useState(false)
  const [invitationCount, setInvitationCount] = useState(0)
  const { activeHunt } = useActiveHunt()
  const supabase = useMemo(() => createClient(), [])

  // Offene Einladungen für das Jagd-Tab-Badge. Refetch bei Navigation,
  // damit das Badge nach Annehmen/Ablehnen (Routenwechsel) aktuell ist.
  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_my_invitations').then(({ data }) => {
      if (!cancelled) setInvitationCount(Array.isArray(data) ? data.length : 0)
    })
    return () => { cancelled = true }
  }, [supabase, pathname])

  // Jagd-Tab: aktive Hunt → direkt dorthin, sonst Jagd-Liste
  const jagdHref = activeHunt ? `/app/hunt/${activeHunt.id}` : '/app?tab=jagden'

  // Slot 2: Live-Jagd → Strecke-Tab, sonst Tagebuch
  const tagebuchOrStreckeHref = activeHunt
    ? `/app/hunt/${activeHunt.id}?tab=strecke`
    : '/app/du/tagebuch'
  const tagebuchOrStreckeLabel = activeHunt ? 'Strecke' : 'Tagebuch'
  const tagebuchOrStreckeIcon = activeHunt ? Stack : Notebook

  const jagdTab = { key: 'jagd', label: 'Jagd', icon: Crosshair, href: jagdHref, badge: invitationCount }
  const tagebuchOrStreckeTab = {
    key: 'tagebuchOrStrecke',
    label: tagebuchOrStreckeLabel,
    icon: tagebuchOrStreckeIcon,
    href: tagebuchOrStreckeHref,
  }
  const chatTab = { key: 'chat', label: 'Chat', icon: ChatCircle, href: '/app?tab=chats' }
  const duTab = { key: 'du', label: 'Du', icon: User, href: '/app/du' }

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
  if (HIDE_ON_ROUTES.some(r => typeof r === 'string' ? pathname.startsWith(r) : r.test(pathname))) return null

  const activeKey = getActiveKey(pathname, searchParams, activeHunt)

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
          {/* Slot 1: Jagd */}
          {renderLinkTab(jagdTab, activeKey)}

          {/* Slot 2: Tagebuch (kein Live-Hunt) / Strecke (Live-Hunt) */}
          {renderLinkTab(tagebuchOrStreckeTab, activeKey)}

          {/* Slot 3: Erlegung (Action-Button, Design-System §5.12: 56px FAB) */}
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
              <BullseyeIcon size={24} ariaLabel="Erlegung" />
            </span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: erlegungOpen ? 700 : 500,
              color: erlegungOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}>
              Erlegung
            </span>
          </button>

          {/* Slot 4: Chat */}
          {renderLinkTab(chatTab, activeKey)}

          {/* Slot 5: Du */}
          {renderLinkTab(duTab, activeKey)}
        </div>
      </nav>

      <ErlegungSheet open={erlegungOpen} onOpenChange={setErlegungOpen} />
    </>
  )
}

function renderLinkTab(
  tab: { key: string; label: string; icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'bold' }>; href: string; badge?: number },
  activeKey: ActiveKey,
) {
  const isActive = activeKey === tab.key
  const showBadge = tab.badge != null && tab.badge > 0
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
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <tab.icon
          size={22}
          weight={isActive ? 'fill' : 'regular'}
        />
        {showBadge && (
          <span style={{
            position: 'absolute',
            top: '-0.375rem',
            left: '0.9375rem',
            minWidth: '1rem',
            height: '1rem',
            borderRadius: '0.5rem',
            background: 'var(--green)',
            color: 'white',
            fontSize: '0.625rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 0.25rem',
          }}>
            {tab.badge! > 9 ? '9+' : tab.badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: '0.75rem', fontWeight: isActive ? 700 : 500 }}>
        {tab.label}
      </span>
    </Link>
  )
}
