'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

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

export type RevierEintrag = { id: string; name: string }

/**
 * Seitenleiste als Client-Komponente, weil Layouts in Next keine searchParams
 * bekommen — das aktive Revier steht aber laut §1.2 in der URL. Der Wechsler
 * liest es hier, die Bereichslinks reichen es weiter, damit ein Bereichswechsel
 * den Geltungsbereich nicht verliert.
 *
 * Die Auswahl ist ein natives <select>: zwei bis eine Handvoll Reviere, volle
 * Tastatur- und Screenreader-Unterstützung geschenkt, kein eigenes Menü.
 */
export default function Seitenleiste({ reviere }: { reviere: RevierEintrag[] }) {
  const pathname = usePathname()
  const router = useRouter()
  // Kein Fallback auf reviere[0]: die Seite leitet auf die kanonische URL mit
  // ?revier= um, sodass der Parameter hier immer gesetzt ist. Zweimal denselben
  // Default herzuleiten wäre die Stelle, an der beide später auseinanderlaufen.
  const aktiv = useSearchParams().get('revier')

  const mitRevier = (href: string) => (aktiv ? `${href}?revier=${aktiv}` : href)

  return (
    <aside className="zentrale-side">
      <div className="zentrale-wordmark">QuickHunt</div>

      {/* Revierwechsler ist Kontext, kein Navigationsziel (§1.2). */}
      <div className="zentrale-switch">
        <label className="lbl" htmlFor="zentrale-revier">
          Revier
        </label>
        {reviere.length > 0 ? (
          <select
            id="zentrale-revier"
            className="val"
            value={aktiv ?? ''}
            onChange={(e) => router.push(`${pathname}?revier=${e.target.value}`)}
          >
            {!aktiv && <option value="">— wählen —</option>}
            {reviere.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="val">—</span>
        )}
      </div>

      <nav className="zentrale-nav" aria-label="Revierzentrale">
        {BEREICHE.map((b) =>
          b.fertig ? (
            <Link
              key={b.href}
              href={mitRevier(b.href)}
              aria-current={pathname === b.href ? 'page' : undefined}
            >
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
  )
}
