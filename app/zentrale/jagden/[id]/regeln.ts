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

// ── Jagdregeln bearbeiten (P1b) ─────────────────────────────────────────────
//
// Kopien aus der App, Stand 27.10.2026 (Bauplan Portal Freigabe/Regeln V2.1,
// E2): `JAGDREGELN_MAX_ZEICHEN`, `REGEL_PUNKT`, `regelnZumSpeichern` aus
// `src/lib/hunt/freigabe.ts`; `abgelehntMitCode` aus
// `src/lib/data/map-objects.ts`; `RegelVorlage`, `pruefeVorlagen`,
// `vorlageEinfuegen` aus `src/lib/hunt/vorlagen.ts`. Testfälle aus
// `freigabe.test.ts` und `vorlagen.test.ts`.
// **Portal-eigen** (nativ inline in `RegelnAnsicht`/`RegelEingabe`):
// `alsFeldtext`, `jagdregelnGeaendert`, `speicherAusgang` — Letzteres bildet
// den Grund wie `ablehnungsGrund` der App, aber aus `SchreibFehler.grund`
// statt aus `message` (Ponytail: eine Kopie mit einem Aufrufer über einen
// Umweg war keine Kopie mehr, sondern Verpackung).

/** Längste Jagdregeln, die die DB nimmt (`hunts_jagdregeln_form`, 138). */
export const JAGDREGELN_MAX_ZEICHEN = 4000

/** Anfang eines Punkts der Regel-Liste (CN-343). */
const REGEL_PUNKT = '• '

/**
 * Jagdregeln zum Speichern (CN-343): jede nicht leere Zeile wird ein Punkt,
 * leere fallen weg; bleibt keiner, `null` — wie im Trigger. Ein selbst
 * getipptes „•" bleibt stehen (Begründung in der App).
 */
export function regelnZumSpeichern(zeilen: readonly string[]): string | null {
  const punkte = zeilen
    .flatMap((z) => z.split('\n'))
    .map((z) => z.trim())
    .filter((z) => z !== '')
  return punkte.length === 0 ? null : punkte.map((p) => REGEL_PUNKT + p).join('\n')
}

/**
 * Der Code einer Ablehnung, sonst `null`. Mit Code hat der Server geantwortet
 * und nichts geschrieben; ohne — Frist, Netz, Kante — ist offen, was geschah.
 * **`''` ist kein Code** (postgrest-js meldet so einen Netzfehler).
 */
export function abgelehntMitCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code !== '' ? code : null
}

/** Eine Vorlage aus `user_settings.regel_vorlagen` (140); `regeln` „• A\n• B". */
export interface RegelVorlage {
  titel: string
  regeln: string
}

/** Liest die Vorlagen; Unlesbares → `undefined`, nie „keine Vorlagen" (S4). */
export function pruefeVorlagen(roh: unknown): RegelVorlage[] | undefined {
  if (!Array.isArray(roh)) return undefined
  for (const v of roh) {
    if (typeof v !== 'object' || v === null) return undefined
    const { titel, regeln } = v as Record<string, unknown>
    if (typeof titel !== 'string' || typeof regeln !== 'string') return undefined
  }
  return roh as RegelVorlage[]
}

/**
 * Fügt eine Vorlage unten an, bestehende Zeilen bleiben; eine wortgleiche
 * Regel kommt nicht doppelt, leere Zeilen fallen weg. Mehrzeilige Felder
 * werden vor dem Vergleich zerlegt (Codex CN-348 C9).
 */
export function vorlageEinfuegen(zeilen: readonly string[], vorlage: RegelVorlage): string[] {
  const da = zeilen
    .flatMap((z) => z.split('\n'))
    .map((z) => z.trim())
    .filter((z) => z !== '')
  const schon = new Set(da)
  const dazu = regelPunkte(vorlage.regeln).filter((p) => {
    if (schon.has(p)) return false
    schon.add(p)
    return true
  })
  return [...da, ...dazu]
}

/**
 * Das Textfeld beim Öffnen: eine Regel je Zeile, ohne Punkt (Bauplan E3).
 * `null` („noch nichts eingetragen") ist der häufige Fall und wird leer.
 */
export function alsFeldtext(basis: string | null): string {
  return basis === null ? '' : regelPunkte(basis).join('\n')
}

/**
 * Hat der Editor etwas geändert? **Beide Seiten normalisiert** (E3, wie
 * `RegelnAnsicht.tsx:158`): ein Servertext mit Leerzeilen oder ohne Punkte
 * hieße sonst schon beim Öffnen „geändert". Der Compare-and-Swap schickt
 * trotzdem die ROHE Basis — verglichen wird gegen das, was der Server hält.
 */
export function jagdregelnGeaendert(neu: string | null, basis: string | null): boolean {
  return neu !== (basis === null ? null : regelnZumSpeichern(regelPunkte(basis)))
}

/** Wie ein gescheitertes Speichern ausging (E6) — einer von vier Ausgängen. */
export type SpeicherAusgang =
  | { art: 'keineZeile' }
  | { art: 'abgemeldet' }
  | { art: 'abgelehnt'; code: string; grund: string }
  | { art: 'keineAntwort' }

/**
 * Ordnet einen Fehler aus `schreibe()` einem Ausgang zu (E6). Liest die Felder
 * von `SchreibFehler` (`schreiben.ts`) über ihre Namen, damit diese Datei
 * ohne Importe bleibt.
 *
 * - `keineZeile` → 0 Zeilen (Compare-and-Swap, Statusfilter, RLS).
 * - Code `PGRST30…` oder Status `401` → Anmeldung abgelaufen.
 * - Sonst ein nichtleerer Code → abgelehnt; der Satz „Bitte die App
 *   aktualisieren." des Triggers fällt weg — im Portal gibt es keine.
 * - Alles andere (`code: ''`, kein Code, kein `SchreibFehler`) → keine
 *   gültige Antwort: offen, ob geschrieben wurde.
 */
export function speicherAusgang(fehler: unknown): SpeicherAusgang {
  if (typeof fehler !== 'object' || fehler === null) return { art: 'keineAntwort' }
  const f = fehler as { keineZeile?: unknown; status?: unknown; grund?: unknown }
  if (f.keineZeile === true) return { art: 'keineZeile' }
  const code = abgelehntMitCode(fehler)
  if (code?.startsWith('PGRST30') || f.status === 401) return { art: 'abgemeldet' }
  if (code === null) return { art: 'keineAntwort' }
  const grund = typeof f.grund === 'string' ? f.grund.replace(/\s*Bitte die App aktualisieren\.?/, '').trim() : ''
  return { art: 'abgelehnt', code, grund: grund === '' ? '' : ` — ${grund}` }
}

// ── Freigabe bearbeiten (P1c) ───────────────────────────────────────────────
//
// Kopien aus der App, Stand 27.10.2026 (Bauplan Portal Freigabe/Regeln V2.1,
// E2), alle aus `src/lib/hunt/freigabe.ts`: `FREIGABE_MAX_ZEILEN`,
// `FreigabeStand`, `pruefeFreigabeVersion`, `blockVon`, `FreigabeArt`,
// `EntwurfZeile`, `konfliktBeimHinzufuegen`, `fuegeHinzu`, `alsEntwurf`,
// `leseGewicht`, `pruefeEntwurf`, `entwurfBloecke`, `verwaisteRegeln`,
// `regelnZumSpeichernJeWildart`, `fassung`, `fassungRegeln`. Testfälle aus
// `freigabe.test.ts`. Die Suche liegt als ganzes Modul daneben (`suche.ts`).
// **Portal-eigen** (nativ inline in `FreigabeAnsicht.tsx` und dort über die
// Komponente nicht getestet): `alsFreigabeArt`, `entwurfStand`,
// `blockTextSetzen`.

/** Höchstens so viele Zeilen nimmt die DB (`hunts_freigabe_form`). */
export const FREIGABE_MAX_ZEILEN = 40

/**
 * Ein BEKANNTER Stand der Freigabe — Arten, Regeln je Wildart und die Version
 * für den Compare-and-Swap: die Basis des Editors. `null` = nicht eingetragen.
 */
export interface FreigabeStand {
  freigabe: FreigabeZeile[] | null
  regeln: FreigabeRegel[] | null
  version: number
}

/** Die Version (140): eine ganze Zahl ab 0, sonst unbekannt. */
export function pruefeFreigabeVersion(roh: unknown): number | undefined {
  return typeof roh === 'number' && Number.isInteger(roh) && roh >= 0 ? roh : undefined
}

/**
 * Der Block, unter dem eine Art steht: ihre Oberart, sonst sie selbst — wie
 * der Trigger in 140 (`coalesce(eltern_id, id)`).
 */
export function blockVon(art: { id: string; elternId: string | null }): string {
  return art.elternId ?? art.id
}

/** Was die Eingabe von einer Katalogart braucht. */
export interface FreigabeArt {
  id: string
  name: string
  elternId: string | null
  /** Trägt die Art ihr Geschlecht schon (Keiler, Bache)? Dann keine Wahl. */
  geschlechtImplizit: boolean
}

/** Eine Zeile im Entwurf — Gewichte als Text, so wie getippt. */
export interface EntwurfZeile {
  art: FreigabeArt
  geschlecht: 'maennlich' | 'weiblich' | null
  gewichtMin: string
  gewichtMax: string
}

/**
 * Darf diese Art zum Entwurf? Zeilen gelten nebeneinander (ODER) — neben
 * „Schwarzwild" wäre „Überläufer · bis 50 kg" wirkungslos.
 *
 * - `oberart-frei`: ihre Oberart steht schon ganz drin → nicht wählbar.
 * - `ersetzt-klassen`: sie IST die Oberart von Zeilen, die schon stehen →
 *   nur nach Rückfrage, und dann ersetzt sie diese.
 */
export function konfliktBeimHinzufuegen(
  art: FreigabeArt,
  zeilen: readonly EntwurfZeile[],
): 'oberart-frei' | 'ersetzt-klassen' | null {
  if (art.elternId !== null && zeilen.some((z) => z.art.id === art.elternId)) return 'oberart-frei'
  if (zeilen.some((z) => z.art.elternId === art.id)) return 'ersetzt-klassen'
  return null
}

/** Fügt eine Art hinzu; ersetzt dabei ihre Klassen, wenn sie deren Oberart ist. */
export function fuegeHinzu(zeilen: readonly EntwurfZeile[], art: FreigabeArt): EntwurfZeile[] {
  return [
    ...zeilen.filter((z) => z.art.elternId !== art.id),
    { art, geschlecht: null, gewichtMin: '', gewichtMax: '' },
  ]
}

/** Ein geladener Wert als Entwurf — `elternId` und Geschlechtsregel aus dem Katalog. */
export function alsEntwurf(
  zeilen: readonly FreigabeZeile[],
  katalog: ReadonlyMap<string, FreigabeArt>,
): EntwurfZeile[] {
  return zeilen.map((z) => ({
    art: katalog.get(z.wildart_id) ?? {
      id: z.wildart_id,
      name: z.name,
      elternId: null,
      geschlechtImplizit: false,
    },
    geschlecht: z.geschlecht,
    gewichtMin: z.gewicht_min === null ? '' : String(z.gewicht_min),
    gewichtMax: z.gewicht_max === null ? '' : String(z.gewicht_max),
  }))
}

function leseGewicht(text: string): number | null | 'ungueltig' {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d{1,3}$/.test(t)) return 'ungueltig'
  const kg = Number(t)
  return kg >= 1 && kg <= 999 ? kg : 'ungueltig'
}

/**
 * Prüft den Entwurf mit denselben Regeln wie der Trigger in 138 — damit die
 * Eingabe an der Zeile sagt, was falsch ist. Der Trigger bleibt der Riegel.
 *
 * @returns je Zeile ein Fehlertext oder `null`, und die Liste zum Speichern
 *   (`null`, wenn leer — „nicht eingetragen").
 */
export function pruefeEntwurf(zeilen: readonly EntwurfZeile[]): {
  fehler: (string | null)[]
  wert: FreigabeZeile[] | null
  gueltig: boolean
} {
  const ids = new Set(zeilen.map((z) => z.art.id))
  const gesehen = new Set<string>()
  const wert: FreigabeZeile[] = []
  const fehler = zeilen.map((z): string | null => {
    const min = leseGewicht(z.gewichtMin)
    const max = leseGewicht(z.gewichtMax)
    // Exakte Dublette = alles gleich, auch das Gewicht: „männlich bis 50 kg"
    // neben „männlich ab 80 kg" ist erlaubt.
    const schluessel = `${z.art.id}:${z.geschlecht ?? ''}:${z.gewichtMin.trim()}:${z.gewichtMax.trim()}`
    let text: string | null = null
    if (min === 'ungueltig' || max === 'ungueltig') text = 'Gewicht in ganzen kg, 1 bis 999.'
    else if (min !== null && max !== null && min > max) text = '„ab" ist grösser als „bis".'
    else if (z.geschlecht !== null && z.art.geschlechtImplizit) text = 'Diese Art trägt ihr Geschlecht schon.'
    else if (z.art.elternId !== null && ids.has(z.art.elternId)) text = 'Die Oberart ist schon ganz freigegeben.'
    else if (gesehen.has(schluessel)) text = 'Diese Zeile steht schon da.'
    gesehen.add(schluessel)
    if (text === null && min !== 'ungueltig' && max !== 'ungueltig') {
      wert.push({
        wildart_id: z.art.id,
        name: z.art.name,
        geschlecht: z.geschlecht,
        gewicht_min: min,
        gewicht_max: max,
      })
    }
    return text
  })
  const gueltig = fehler.every((f) => f === null) && zeilen.length <= FREIGABE_MAX_ZEILEN
  return { fehler, wert: wert.length > 0 ? wert : null, gueltig }
}

/**
 * Die Wildarten, für die man im Entwurf Regeln eintragen kann: je Zeile ihr
 * Block (`blockVon`), jede einmal, alphabetisch.
 */
export function entwurfBloecke(
  zeilen: readonly EntwurfZeile[],
  katalog: ReadonlyMap<string, FreigabeArt>,
): { id: string; name: string }[] {
  const bloecke = new Map<string, string>()
  for (const z of zeilen) {
    const id = blockVon(z.art)
    if (!bloecke.has(id)) bloecke.set(id, katalog.get(id)?.name ?? z.art.name)
  }
  return [...bloecke]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Regeln, deren Wildart im Entwurf keinen Block mehr hat — der Trigger in 140 lehnt sie ab. */
export function verwaisteRegeln(
  regeln: readonly FreigabeRegel[],
  zeilen: readonly EntwurfZeile[],
): FreigabeRegel[] {
  const bloecke = new Set(zeilen.map((z) => blockVon(z.art)))
  return regeln.filter((r) => !bloecke.has(r.wildart_id))
}

/** Die Regeln zum Speichern: alphabetisch nach Wildart, `null`, wenn keine — wie im Trigger. */
export function regelnZumSpeichernJeWildart(regeln: readonly FreigabeRegel[]): FreigabeRegel[] | null {
  return regeln.length === 0 ? null : [...regeln].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Vergleichbare Form einer Freigabe — unabhängig von der Schlüsselreihenfolge des Servers. */
export function fassung(wert: FreigabeZeile[] | string | null | undefined): string | null | undefined {
  if (wert === undefined || wert === null) return wert
  if (typeof wert === 'string') return wert
  return JSON.stringify(wert.map((z) => [z.wildart_id, z.name, z.geschlecht, z.gewicht_min, z.gewicht_max]))
}

/** Vergleichbare Form der Regeln je Wildart — wie `fassung`. */
export function fassungRegeln(regeln: readonly FreigabeRegel[] | null | undefined): string | null | undefined {
  if (regeln === undefined || regeln === null) return regeln
  return JSON.stringify(regeln.map((r) => [r.wildart_id, r.name, r.regeln]))
}

/** Katalogzeile (096, 097) → Eingabe-Art (`FreigabeAnsicht.tsx:57`). */
export function alsFreigabeArt(w: {
  id: string
  name: string
  eltern_id: string | null
  geschlecht_implizit: string | null
}): FreigabeArt {
  return { id: w.id, name: w.name, elternId: w.eltern_id, geschlechtImplizit: w.geschlecht_implizit !== null }
}

/** Was der Editor aus Entwurf und Basis ableitet (`FreigabeAnsicht.tsx:288-303`). */
export interface EntwurfStand {
  pruefung: ReturnType<typeof pruefeEntwurf>
  /** Die Wildarten des Entwurfs — je eine ein Regelfeld. */
  bloecke: { id: string; name: string }[]
  /** Was gesendet wird: nur Regeln, deren Wildart im Entwurf steht. */
  sichtbareRegeln: FreigabeRegel[] | null
  /** Regeln ohne Wildart im Entwurf — bleiben im Zustand, werden nicht gesendet. */
  ausgeblendet: FreigabeRegel[]
  /** Summe über die gesendeten Texte, UTF-16 wie die App (E3). */
  regelZeichen: number
  regelnZuLang: boolean
  geaendert: boolean
}

/**
 * Der abgeleitete Stand des Editors. **Gezählt und verglichen wird, was im
 * Zustand steht**, also unberührte Blöcke roh, wie gespeichert (E3, Codex
 * D1): ein roher Block voller Leerzeilen zählt so lang, wie der Server zählt.
 */
export function entwurfStand(
  zeilen: readonly EntwurfZeile[],
  regeln: readonly FreigabeRegel[],
  arten: ReadonlyMap<string, FreigabeArt>,
  basis: FreigabeStand,
): EntwurfStand {
  const pruefung = pruefeEntwurf(zeilen)
  const bloecke = entwurfBloecke(zeilen, arten)
  const blockIds = new Set(bloecke.map((b) => b.id))
  const sichtbareRegeln = regelnZumSpeichernJeWildart(regeln.filter((r) => blockIds.has(r.wildart_id)))
  const regelZeichen = (sichtbareRegeln ?? []).reduce((n, r) => n + r.regeln.length, 0)
  return {
    pruefung,
    bloecke,
    sichtbareRegeln,
    ausgeblendet: regeln.filter((r) => !blockIds.has(r.wildart_id)),
    regelZeichen,
    regelnZuLang: regelZeichen > JAGDREGELN_MAX_ZEICHEN,
    // Eine ungültige Zeile fehlt in `pruefung.wert` — ohne `!gueltig` hieße
    // „Art dazu, Gewicht 0" nicht geändert, und Schließen wie Reload
    // verwürfen sie ohne Rückfrage (Codex P1c A2/C-F2; in der App ebenso).
    // *Preis, benannt (Schlusslesung P1c, F1):* eine schon gespeicherte
    // ungültige Zeile (Dublette per REST, oder „050"/„50", CP-111) zeigt
    // beim Öffnen „Verwerfen …", ohne dass jemand getippt hat. Gemessen
    // 27.10.2026: 0 solcher Zeilen; Speichern ist ohnehin gesperrt, bis die
    // Zeile entfernt ist.
    geaendert:
      !pruefung.gueltig ||
      fassung(pruefung.wert) !== fassung(basis.freigabe) ||
      fassungRegeln(sichtbareRegeln) !== fassungRegeln(regelnZumSpeichernJeWildart(basis.regeln ?? [])),
  }
}

/**
 * Das getippte Feld eines Blocks in den Zustand (E3, `regelUebernehmen`):
 * neu gefasst über `regelnZumSpeichern`, leer entfernt den Eintrag. **Gleicht
 * es normalisiert dem gespeicherten Text dieses Blocks, bleibt der rohe
 * gespeicherte Eintrag stehen** — Tippen und Zurücktippen ändert dann nichts
 * (Codex 4b, Schlusslesung F2). Andere Blöcke bleiben unberührt.
 */
export function blockTextSetzen(
  regeln: readonly FreigabeRegel[],
  block: { id: string; name: string },
  feld: string,
  gespeichert: readonly FreigabeRegel[] | null,
): FreigabeRegel[] {
  const ohne = regeln.filter((r) => r.wildart_id !== block.id)
  const neu = regelnZumSpeichern([feld])
  if (neu === null) return ohne
  const alt = gespeichert?.find((r) => r.wildart_id === block.id)
  if (alt && neu === regelnZumSpeichern(regelPunkte(alt.regeln))) return [...ohne, alt]
  return [...ohne, { wildart_id: block.id, name: block.name, regeln: neu }]
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
