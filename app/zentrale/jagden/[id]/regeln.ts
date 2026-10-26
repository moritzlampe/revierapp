/**
 * Freigabe, Jagdregeln und Sicht einer Jagd — die reinen Regeln für das
 * Portal (Fahrplan P1a, `quickhunt-native/docs/konzepte/
 * QuickHunt_Fahrplan_Portal_Jagdplanung_V1.md`). Kein React, kein Supabase,
 * keine Importe: der Selbsttest daneben läuft unter blankem
 * `node --experimental-strip-types` (dieselbe Bauform wie `treiben.ts`).
 *
 * **Eine bewusste Kopie, keine eigene Regel.** Die Funktionen unten stammen
 * wortgleich aus der App — `quickhunt-native/src/lib/hunt/freigabe.ts`
 * (`pruefe*`, `freigabeText`, `hatGewicht`, `sortiereNachWildart`,
 * `freigabeBloecke`, `regelBloecke`, `regelPunkte`) und
 * `quickhunt-native/src/lib/hunt/sicht.ts` (`SCHUETZEN_SICHTEN`,
 * `UMKREIS_METER`, `umkreisOptionen`, `sichtText`, `sichtAusZeile`), Stand
 * 26.10.2026. Importieren geht nicht (zwei Repos). **Wer dort eine dieser
 * Funktionen ändert, ändert sie hier mit** — die Testfälle in
 * `regeln.selftest.ts` sind die aus `freigabe.test.ts` und `sicht.test.ts`
 * und schlagen an, wenn die beiden auseinanderlaufen, aber nur, wenn jemand
 * sie auch hier nachzieht. **Portal-eigen** sind die Fälle für
 * `sichtLesetext`, `sichtEnthaelt` und `sichtSpalte` — nativ steckt diese
 * Logik inline (`SichtBlock`, `speichereJagdSicht`); Spaltenzuordnung und
 * Rückgabe-Vergleich sind dort über `speichereJagdSicht` getestet
 * (`src/lib/data/__tests__/hunts.test.ts`), der Lesetext nicht (Schlusslesung
 * 26.10.2026, B4/D1).
 *
 * Die Bedeutung der Spalten steht in den Migrationen 138, 140 und 141 (und
 * ihren Begründungen unter `quickhunt-native/docs/migrationen/`). Kurz:
 * `freigabe` und `freigabe_regeln` sind Listen, die der Trigger prüft und
 * deren `name` er aus dem Katalog setzt; `jagdregeln` ist Text in Punkten
 * („• A\n• B"); `null` heißt „nicht eingetragen", ein unlesbarer Wert
 * `undefined` = unbekannt, nie „nicht eingetragen" (S4).
 */

// ── Freigabe (138) ──────────────────────────────────────────────────────────

/** Eine Zeile der Freigabe — in der Form, die der Server speichert. */
export interface FreigabeZeile {
  wildart_id: string
  name: string
  geschlecht: 'maennlich' | 'weiblich' | null
  gewicht_min: number | null
  gewicht_max: number | null
}

/** Regeln einer Wildart (140); `wildart_id` ist der Block, `regeln` „• A\n• B". */
export interface FreigabeRegel {
  wildart_id: string
  name: string
  regeln: string
}

function istZahlOderNull(wert: unknown): wert is number | null {
  return wert === null || (typeof wert === 'number' && Number.isFinite(wert))
}

/** `null` → nicht eingetragen; lesbare Liste → Liste; sonst `undefined` (unbekannt). */
export function pruefeFreigabe(roh: unknown): FreigabeZeile[] | null | undefined {
  if (roh === null) return null
  if (!Array.isArray(roh)) return undefined
  for (const z of roh) {
    if (typeof z !== 'object' || z === null) return undefined
    const zeile = z as Record<string, unknown>
    if (typeof zeile.wildart_id !== 'string' || typeof zeile.name !== 'string') return undefined
    if (zeile.geschlecht !== null && zeile.geschlecht !== 'maennlich' && zeile.geschlecht !== 'weiblich') {
      return undefined
    }
    if (!istZahlOderNull(zeile.gewicht_min) || !istZahlOderNull(zeile.gewicht_max)) return undefined
  }
  return roh as FreigabeZeile[]
}

/** Jagdregeln — wie `pruefeFreigabe`. */
export function pruefeJagdregeln(roh: unknown): string | null | undefined {
  if (roh === null) return null
  return typeof roh === 'string' ? roh : undefined
}

/** Regeln je Wildart — wie `pruefeFreigabe`. */
export function pruefeFreigabeRegeln(roh: unknown): FreigabeRegel[] | null | undefined {
  if (roh === null) return null
  if (!Array.isArray(roh)) return undefined
  for (const r of roh) {
    if (typeof r !== 'object' || r === null) return undefined
    const { wildart_id, name, regeln } = r as Record<string, unknown>
    if (typeof wildart_id !== 'string' || typeof name !== 'string' || typeof regeln !== 'string') return undefined
  }
  return roh as FreigabeRegel[]
}

function gewichtText(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${min}–${max} kg`
  if (max !== null) return `bis ${max} kg`
  if (min !== null) return `ab ${min} kg`
  return null
}

/** „männlich · bis 50 kg" — leer, wenn die Zeile nichts einschränkt. */
function einschraenkung(zeile: FreigabeZeile): string {
  const geschlecht =
    zeile.geschlecht === 'maennlich' ? 'männlich' : zeile.geschlecht === 'weiblich' ? 'weiblich' : null
  return [geschlecht, gewichtText(zeile.gewicht_min, zeile.gewicht_max)]
    .filter((teil): teil is string => teil !== null)
    .join(' · ')
}

/** „Überläufer · männlich · bis 50 kg". */
export function freigabeText(zeile: FreigabeZeile): string {
  const rest = einschraenkung(zeile)
  return rest === '' ? zeile.name : `${zeile.name} · ${rest}`
}

/** Trägt eine Zeile ein Gewicht? Dann steht „Gewichte: aufgebrochen" darunter. */
export function hatGewicht(zeilen: readonly FreigabeZeile[]): boolean {
  return zeilen.some((z) => z.gewicht_min !== null || z.gewicht_max !== null)
}

/** Was Sortierung und Blöcke von einer Katalogart brauchen. */
export interface KatalogArt {
  name: string
  elternId: string | null
}

/** Ein Block der Ansicht: die Wildart und darunter, was von ihr frei ist. */
export interface FreigabeBlock {
  titel: string
  /** Leer: die Art ist ohne Einschränkung frei (Fuchs) — der Titel genügt. */
  zeilen: string[]
  /** Die Regeln dieser Wildart als Punkte — leer, wenn keine. */
  regeln: string[]
}

/** Die Wildart einer Zeile: ihre Oberart, sonst sie selbst (s. App). */
function wildartVon(z: FreigabeZeile, katalog: ReadonlyMap<string, KatalogArt>): { id: string; name: string } {
  const elternId = katalog.get(z.wildart_id)?.elternId ?? null
  const eltern = elternId === null ? undefined : katalog.get(elternId)
  return elternId !== null && eltern ? { id: elternId, name: eltern.name } : { id: z.wildart_id, name: z.name }
}

/** Wildarten alphabetisch, darin die Klassen alphabetisch (CN-347). */
export function sortiereNachWildart(
  zeilen: readonly FreigabeZeile[],
  katalog: ReadonlyMap<string, KatalogArt>,
): FreigabeZeile[] {
  return [...zeilen].sort(
    (a, b) =>
      wildartVon(a, katalog).name.localeCompare(wildartVon(b, katalog).name, 'de') ||
      a.name.localeCompare(b.name, 'de'),
  )
}

/**
 * Die Blöcke der Ansicht — je Wildart einer, darunter, was frei ist, und ihre
 * Regeln. Eine Regel ohne Block steht als eigener Block am Ende, nie
 * versteckt (S4). Ausführlich begründet in der App (`freigabeBloecke`).
 */
export function freigabeBloecke(
  zeilen: readonly FreigabeZeile[],
  katalog: ReadonlyMap<string, KatalogArt>,
  regeln: readonly FreigabeRegel[] = [],
): FreigabeBlock[] {
  const hatKlassen = new Set([...katalog.values()].map((a) => a.elternId).filter((id) => id !== null))
  const bloecke: { id: string; titel: string; zeilen: string[] }[] = []
  for (const z of sortiereNachWildart(zeilen, katalog)) {
    const art = wildartVon(z, katalog)
    let block = bloecke.at(-1)
    if (block?.id !== art.id) {
      block = { id: art.id, titel: art.name, zeilen: [] }
      bloecke.push(block)
    }
    if (art.id !== z.wildart_id) {
      block.zeilen.push(freigabeText(z))
      continue
    }
    const rest = einschraenkung(z)
    if (rest === '') block.zeilen.push('alle')
    else block.zeilen.push(hatKlassen.has(z.wildart_id) ? `alle · ${rest}` : rest)
  }
  const regelnVon = new Map(regeln.map((r) => [r.wildart_id, r]))
  const mitRegeln = bloecke.map(({ id, titel, zeilen: z }) => {
    const r = regelnVon.get(id)
    regelnVon.delete(id)
    return {
      titel,
      zeilen: !hatKlassen.has(id) && z.length === 1 && z[0] === 'alle' ? [] : z,
      regeln: r ? regelPunkte(r.regeln) : [],
    }
  })
  return [...mitRegeln, ...regelBloecke([...regelnVon.values()])]
}

/** Regeln je Wildart als eigene Blöcke, alphabetisch. */
export function regelBloecke(regeln: readonly FreigabeRegel[]): FreigabeBlock[] {
  return [...regeln]
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((r) => ({ titel: r.name, zeilen: [], regeln: regelPunkte(r.regeln) }))
}

/** Jagdregeln als Punkte (CN-343): jede nicht leere Zeile, „•" am Anfang weg. */
export function regelPunkte(text: string): string[] {
  return text
    .split('\n')
    .map((z) => z.trim().replace(/^•/, '').trimStart())
    .filter((z) => z !== '')
}

// ── Sicht (141) ─────────────────────────────────────────────────────────────

export type SchuetzenSicht = 'alles' | 'umkreis' | 'eigener'
export type GruppenleiterSicht = 'alles' | 'wie_schuetzen'

export interface JagdSicht {
  schuetzen: SchuetzenSicht
  umkreisM: number
  gruppenleiter: GruppenleiterSicht
}

export const SCHUETZEN_SICHTEN: { value: SchuetzenSicht; label: string }[] = [
  { value: 'alles', label: 'Alles' },
  { value: 'umkreis', label: 'Umkreis' },
  { value: 'eigener', label: 'Nur eigener Stand' },
]

/** Was die App zur Wahl stellt; der CHECK in 141 erlaubt 50–2000 m. */
export const UMKREIS_METER = [100, 200, 300, 500] as const

/** Die Radien zur Wahl — ein gespeicherter Wert außerhalb der Liste steht mit drin. */
export function umkreisOptionen(aktuell: number): { value: number; label: string }[] {
  const werte: number[] = [...UMKREIS_METER]
  if (!werte.includes(aktuell)) werte.push(aktuell)
  return werte.sort((a, b) => a - b).map((m) => ({ value: m, label: `${m} m` }))
}

/** Eine Zeile Klartext: „Umkreis 300 m", „Nur eigener Stand" … */
export function sichtText(sicht: JagdSicht): string {
  if (sicht.schuetzen === 'umkreis') return `Umkreis ${sicht.umkreisM} m`
  return SCHUETZEN_SICHTEN.find((s) => s.value === sicht.schuetzen)?.label ?? sicht.schuetzen
}

/**
 * Der Lesetext — „Umkreis 300 m · Gruppenleiter sehen alles". Der Zusatz steht
 * nur, wenn die Stufe nicht ohnehin „alles" ist. Aus der App
 * (`SichtBlock.tsx`, `lesetext`), dort inline.
 */
export function sichtLesetext(sicht: JagdSicht): string {
  return `${sichtText(sicht)}${sicht.schuetzen !== 'alles' && sicht.gruppenleiter === 'alles' ? ' · Gruppenleiter sehen alles' : ''}`
}

function istSchuetzenSicht(wert: unknown): wert is SchuetzenSicht {
  return wert === 'alles' || wert === 'umkreis' || wert === 'eigener'
}

function istGruppenleiterSicht(wert: unknown): wert is GruppenleiterSicht {
  return wert === 'alles' || wert === 'wie_schuetzen'
}

function istUmkreis(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= 50 && wert <= 2000
}

/** Die drei Werte aus einer `hunts`-Zeile; `undefined`, wenn einer unbekannt ist (S4). */
export function sichtAusZeile(zeile: {
  schuetzen_sicht?: unknown
  sicht_umkreis_m?: unknown
  gruppenleiter_sicht?: unknown
}): JagdSicht | undefined {
  const { schuetzen_sicht: s, sicht_umkreis_m: m, gruppenleiter_sicht: g } = zeile
  if (!istSchuetzenSicht(s) || !istUmkreis(m) || !istGruppenleiterSicht(g)) return undefined
  return { schuetzen: s, umkreisM: m, gruppenleiter: g }
}

/**
 * Eine Änderung — immer genau EINE Spalte (S6, Bauplan Gast-Sicht E8): zwei
 * Jagdleiter, die gleichzeitig Stufe und Radius ändern, überschreiben einander
 * nicht. (Wortgleich aus der App.)
 */
export type SichtAenderung =
  | { feld: 'schuetzen'; wert: SchuetzenSicht }
  | { feld: 'umkreisM'; wert: number }
  | { feld: 'gruppenleiter'; wert: GruppenleiterSicht }

/** Ist die Änderung im Wert schon enthalten? (Wortgleich aus der App.) */
export function sichtEnthaelt(sicht: JagdSicht, aenderung: SichtAenderung): boolean {
  return sicht[aenderung.feld] === aenderung.wert
}

/**
 * Die eine Spalte für das UPDATE — in der App steckt dieselbe Zuordnung in
 * `speichereJagdSicht()` (`src/lib/data/hunts.ts`), hier ohne Supabase, damit
 * der Selbsttest sie erreicht.
 */
export function sichtSpalte(aenderung: SichtAenderung): Record<string, string | number> {
  return aenderung.feld === 'schuetzen'
    ? { schuetzen_sicht: aenderung.wert }
    : aenderung.feld === 'umkreisM'
      ? { sicht_umkreis_m: aenderung.wert }
      : { gruppenleiter_sicht: aenderung.wert }
}
