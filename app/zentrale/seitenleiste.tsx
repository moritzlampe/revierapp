'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Sechs Bereiche, gelockt in QuickHunt_Konzept_Revierzentrale_V1.md §1.1.
// "Gäste" kam am 01.08.2026 dazu, als der Gästestamm entstand (Migration 085) —
// die Lock-Begründung "keinen kanonischen Gästestamm" war damit entfallen und
// ist im Konzept nachgezogen worden.
// Bewusst KEIN "Einstellungen" und KEIN eigener Drückjagd-Bereich.
// `fertig` steuert, ob verlinkt wird — nicht gebaute Ziele wären sonst 404.
const BEREICHE = [
  { href: '/zentrale', label: 'Übersicht', fertig: true },
  // Seit 08.08.2026 gebaut, und der Karteneditor darin ist NICHT neu: er stand
  // bis dahin auf der ÜBERSICHT, weil der Bereich nie eine eigene Route bekam.
  // Damit war „Revier" der einzige der sechs, dessen Inhalt es längst gab und
  // den die Seitenleiste trotzdem nicht verlinken konnte.
  { href: '/zentrale/revier', label: 'Revier', fertig: true },
  { href: '/zentrale/jagden', label: 'Jagden', fertig: true },
  // Seit 07.08.2026 gebaut, aber nur die Unterebene „Strecke" (A-C4): die
  // historische Chronik des Reviers. Abschussplan und Beobachtungen fehlen
  // sichtbar, statt deaktiviert dazustehen — dieselbe Haltung wie beim
  // fehlenden Bereich "Drückjagd".
  { href: '/zentrale/dokumentation', label: 'Dokumentation', fertig: true },
  { href: '/zentrale/jagderlaubnisse', label: 'Jagderlaubnisse', fertig: true },
  { href: '/zentrale/gaeste', label: 'Gäste', fertig: true },
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
  const parameter = useSearchParams()
  const aktiv = parameter.get('revier')

  const mitRevier = (href: string) => (aktiv ? `${href}?revier=${aktiv}` : href)

  /**
   * Revier wechseln, ohne die übrigen Parameter wegzuwerfen.
   *
   * Vorher stand hier `?revier=<id>` als ganze Query — das löschte still jeden
   * anderen Zustand. Aufgefallen ist es an `/zentrale/gaeste`, das Suche und
   * Filter in der URL ablegt (§2.4): ein Griff an den Wechsler leerte das
   * Suchfeld. Die Bereichslinks oben tragen bewusst weiterhin **nur** das
   * Revier — ein Filter der Gästeliste hat in einem anderen Bereich nichts
   * verloren; ein Revierwechsel dagegen verlässt die Seite gar nicht.
   */
  function revierWechseln(id: string) {
    const p = new URLSearchParams(parameter.toString())
    p.set('revier', id)
    router.push(`${pathname}?${p.toString()}`)
  }

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
            onChange={(e) => revierWechseln(e.target.value)}
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
