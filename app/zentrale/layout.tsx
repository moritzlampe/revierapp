import type { Viewport } from 'next'
import './zentrale.css'

// Eigenes Viewport statt des Handy-Viewports aus dem Root-Layout: kein
// userScalable:false (blockiert Browser-Zoom), kein viewportFit/cover, kein
// interactiveWidget. Per-Segment-Override ist in diesem Repo etabliert,
// siehe app/app/du/tagebuch/[type]/[id]/layout.tsx.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#EDE8DA',
}

// Fünf Bereiche, gelockt in QuickHunt_Konzept_Revierzentrale_V1.md §1.1.
// Bewusst KEIN "Einstellungen" und KEIN eigener Drückjagd-Bereich.
const BEREICHE = [
  { href: '/zentrale', label: 'Übersicht' },
  { href: '/zentrale/revier', label: 'Revier' },
  { href: '/zentrale/jagden', label: 'Jagden' },
  { href: '/zentrale/dokumentation', label: 'Dokumentation' },
  { href: '/zentrale/jagderlaubnisse', label: 'Jagderlaubnisse' },
]

export default function ZentraleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="zentrale">
      <aside className="zentrale-side">
        <div className="zentrale-wordmark">QuickHunt</div>

        {/* Revierwechsler ist Kontext, kein Navigationsziel (§1.2).
            Verdrahtung folgt in Phase 2 mit den echten Revieren. */}
        <div className="zentrale-switch">
          <span className="lbl">Revier</span>
          <span className="val">—</span>
        </div>

        <nav className="zentrale-nav">
          {BEREICHE.map((b) => (
            <a key={b.href} href={b.href}>
              {b.label}
            </a>
          ))}
        </nav>

        <div className="zentrale-foot">
          <a href="/app">Feld-App öffnen ↗</a>
        </div>
      </aside>

      <main className="zentrale-main">{children}</main>
    </div>
  )
}
