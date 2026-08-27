import Link from 'next/link'

/**
 * Die lokalen Unterebenen der Dokumentation als horizontale Reiter unter dem
 * Seitentitel (Konzept §1.2).
 *
 * **Links, keine Knöpfe.** Die Reiterleiste über der Revierkarte
 * (`.zentrale-karte-reiter`) schaltet einen Client-Zustand um; hier sind es
 * zwei Routen. Der Zustand gehört in die Adresse — dieselbe Entscheidung wie
 * beim Jagdjahr-Filter (Konzept §2.4): ein geteilter Link soll dieselbe
 * Ansicht zeigen.
 *
 * **Kein `usePathname`, und deshalb kein `'use client'`.** Die Seite weiss, wo
 * sie ist; sie sagt es als Prop. Ein Hook dafür machte aus zwei
 * Server-Komponenten eine Client-Komponente, die beim Laden erst noch
 * herausfinden muss, was sie schon weiss.
 *
 * **Die Revier-ID wandert mit.** Ohne sie fiele der Wechsel auf das erste
 * Revier zurück, und wer beim zweiten Revier steht, landete beim ersten —
 * derselbe Verlust wie in A-J1, wo der Rücklink Jagdjahr und Filter abwirft.
 */
const ZIELE = [
  { schluessel: 'strecke', href: '/zentrale/dokumentation', label: 'Strecke' },
  { schluessel: 'statistik', href: '/zentrale/dokumentation/statistik', label: 'Statistik' },
] as const

export type Unterebene = (typeof ZIELE)[number]['schluessel']

export function Reiter({ aktiv, revier }: { aktiv: Unterebene; revier: string }) {
  return (
    <nav className="dok-reiter" aria-label="Dokumentation">
      {ZIELE.map((z) => (
        <Link
          key={z.schluessel}
          href={`${z.href}?revier=${revier}`}
          className={z.schluessel === aktiv ? 'aktiv' : undefined}
          aria-current={z.schluessel === aktiv ? 'page' : undefined}
        >
          {z.label}
        </Link>
      ))}
    </nav>
  )
}
