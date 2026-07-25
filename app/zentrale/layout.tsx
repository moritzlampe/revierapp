import type { Viewport } from 'next'
import Link from 'next/link'
import './zentrale.css'

// ACHTUNG: Next merged Viewports FELDWEISE mit dem Root-Layout. Felder einfach
// wegzulassen genügt nicht — die Handy-Werte aus app/layout.tsx blieben sonst
// erhalten, inklusive user-scalable=no. Jedes zu neutralisierende Feld muss
// deshalb hier explizit gesetzt werden.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // überschreibt maximumScale:1 → Browser-Zoom bleibt möglich
  userScalable: true, // überschreibt userScalable:false
  viewportFit: 'auto', // überschreibt 'cover' (Notch-Logik ist Handy-Sache)
  interactiveWidget: 'resizes-visual', // überschreibt 'resizes-content'
  themeColor: '#EDE8DA',
}

// Fünf Bereiche, gelockt in QuickHunt_Konzept_Revierzentrale_V1.md §1.1.
// Bewusst KEIN "Einstellungen" und KEIN eigener Drückjagd-Bereich.
// `fertig` steuert, ob verlinkt wird — nicht gebaute Ziele wären sonst 404.
const BEREICHE = [
  { href: '/zentrale', label: 'Übersicht', fertig: true },
  { href: '/zentrale/revier', label: 'Revier', fertig: false },
  { href: '/zentrale/jagden', label: 'Jagden', fertig: false },
  { href: '/zentrale/dokumentation', label: 'Dokumentation', fertig: false },
  { href: '/zentrale/jagderlaubnisse', label: 'Jagderlaubnisse', fertig: false },
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

        <nav className="zentrale-nav" aria-label="Revierzentrale">
          {BEREICHE.map((b) =>
            b.fertig ? (
              <Link key={b.href} href={b.href} aria-current="page">
                {b.label}
              </Link>
            ) : (
              <span key={b.href} className="zentrale-nav-offen" aria-disabled="true">
                {b.label}
              </span>
            )
          )}
        </nav>

        <div className="zentrale-foot">
          {/* Bewusst <a>: Wechsel in die Feld-App, eigener Layout-Baum. */}
          <a href="/app">Feld-App öffnen ↗</a>
        </div>
      </aside>

      <main className="zentrale-main">{children}</main>
    </div>
  )
}
