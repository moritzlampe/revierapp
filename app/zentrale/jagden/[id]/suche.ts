// Katalogsuche — **eine bewusste Kopie des ganzen Moduls**
// `quickhunt-native/src/lib/wild/suche.ts`, Stand 27.10.2026 (Bauplan Portal
// Freigabe/Regeln V2.1, E2: das ganze Modul, nicht einzelne Funktionen, sonst
// fehlen ihre Abhängigkeiten). Importieren geht nicht (zwei Repos). **Wer dort
// ändert, ändert hier mit** — die Testfälle in `suche.selftest.ts` sind die aus
// `suche.test.ts`. Die Begründungen stehen ausführlich in der App.
//
// Reine Funktion, keine Importe: läuft unter blankem
// `node --experimental-strip-types` (wie `regeln.ts`).

/** Was die Suche von einer Katalogzeile braucht. */
export interface SuchbareArt {
  name: string
  suchbegriffe: string[]
}

const UMLAUTE: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' }

/**
 * Bringt Eingabe und Katalogzeile auf dieselbe Schreibweise: kombinierende
 * Zeichen weg, Umlaute und ß auf ihre Grundbuchstaben, ae/oe/ue auf a/o/u,
 * Trennzeichen weg. Leerraum bleibt — `sucheArten` trennt daran die Wörter.
 * Die Reihenfolge der Schritte ist nicht beliebig (s. App).
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[äöüß]/g, (z) => UMLAUTE[z])
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[-_'’.]/g, '')
}

/** Der Heuhaufen einer Zeile: Name (an Position 0) und Suchbegriffe. */
function heuhaufen(art: SuchbareArt): string[] {
  return [art.name, ...art.suchbegriffe].map(normalisiere)
}

/**
 * Arten, auf die die Eingabe passt — Teilstring auf Name oder Suchbegriff;
 * jedes Wort der Eingabe muss irgendwo passen. Leere Eingabe → die Liste
 * unverändert. Rang unabhängig von der Wortreihenfolge: Wörter im Namen ×2,
 * +1, wenn ein Wort den Namen beginnt. Bei Gleichstand bleibt die Reihenfolge
 * der Eingabeliste — der Aufrufer sortiert nach Name vor.
 */
export function sucheArten<T extends SuchbareArt>(arten: T[], eingabe: string): T[] {
  const woerter = normalisiere(eingabe).split(/\s+/).filter(Boolean)
  if (woerter.length === 0) return arten

  const treffer: { art: T; rang: number }[] = []
  for (const art of arten) {
    const felder = heuhaufen(art)
    if (!woerter.every((wort) => felder.some((feld) => feld.includes(wort)))) continue
    const name = felder[0]
    const imNamen = woerter.filter((wort) => name.includes(wort)).length
    const beginnt = woerter.some((wort) => name.startsWith(wort))
    treffer.push({ art, rang: imNamen * 2 + (beginnt ? 1 : 0) })
  }

  return treffer.sort((a, b) => b.rang - a.rang).map((t) => t.art)
}
