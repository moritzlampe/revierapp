/**
 * Der Middleware-Matcher aus `proxy.ts` — **die Auth-Grenze der ganzen
 * Anwendung**, gegen ihre Gegenbeispiele geprüft.
 *
 * Lauf: `node --experimental-strip-types src/lib/proxy-matcher.selftest.ts`
 * (oder `npm run selftest`, das `app` und `src` absucht — deshalb liegt diese
 * Datei hier und nicht neben `proxy.ts`: **ein Selbsttest in der Wurzel würde
 * nie gefunden**, und ein Test, der nie läuft, ist schlimmer als keiner).
 *
 * ## Warum es diesen Test gibt
 *
 * Die Fremdprüfung vom 26.08.2026 (Codex GPT-5.4, `[medium]`) fand am
 * CP-81-Fix, dass der negative Lookahead **breiter war als die gemeinte
 * Freigabe**: der Punkt in `manifest.json` ist im Regex ein Platzhalter, und
 * kein Eintrag war ans Pfadende gebunden. `/manifestXjson` und `/sw.js/x`
 * kamen an der Anmeldeprüfung vorbei.
 *
 * **Beim Beheben ist der Autor prompt in die zweite Falle getreten**, und
 * genau die kann ein Blick auf den Code nicht sehen: in einem
 * JavaScript-String ist `'\.'` schlicht `'.'` — ein unbekanntes Escape fällt
 * auf sein Zeichen zurück. Der Ausdruck stand mit einfachem Backslash da, sah
 * korrekt aus und war es nicht. Aufgefallen ist es nur, weil das Literal
 * ausgewertet statt gelesen wurde.
 *
 * **Deshalb prüft dieser Test den AUSGEWERTETEN String, nicht den Dateitext.**
 * Ein Test über den Quelltext hätte den Fehler bestätigt statt ihn zu finden.
 *
 * ## Warum das Literal aus der Datei geholt wird
 *
 * Naheliegender wäre `import { config } from '../../proxy.ts'`. Das geht
 * nicht: `proxy.ts` zieht `@supabase/ssr` und `next/server` nach, und beides
 * lädt unter `--experimental-strip-types` nicht. Den Matcher in eine eigene
 * importfreie Datei auszulagern — das Muster von `app/zentrale/objekte.ts` —
 * geht ebenfalls nicht: **Next.js wertet `export const config` statisch beim
 * Build aus**, ein importierter Wert wäre dort kein Literal mehr.
 *
 * Bleibt: das Literal aus der Quelle greifen und mit `new Function`
 * auswerten. Hässlich, aber es misst genau die Stelle, an der es schiefgeht.
 *
 * ## Was dieser Test NICHT kann
 *
 * Er liest die **Quelle**; ausgeliefert wird der **Build** (Schlusslesung
 * 26.08.2026, F2). Nach einer Matcher-Änderung ohne frisches `npm run build`
 * ist er grün, während der laufende Server den alten Ausdruck fährt. Er liest
 * also dieselbe Zeichenkette, die Next.js beim NÄCHSTEN Build lesen wird —
 * nicht die, die gerade wirkt.
 *
 * **Das ist keine graue Theorie, es ist am 26.08.2026 passiert:** ein
 * `pkill -f "next start"` beendete den Server nicht (der Prozess heisst
 * `next-server`), und eine ganze Messrunde galt dem alten Build. Der Fix sah
 * wirkungslos aus.
 *
 * **Pflichtschritt nach jeder Matcher-Änderung, den dieser Test nicht
 * ersetzt:** den kompilierten Ausdruck gegenlesen —
 * `.next/server/functions-config-manifest.json`, unter
 * `functions./_middleware.matchers[0].regexp`. Dort steht, was Next.js
 * tatsächlich daraus gemacht hat.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const hier = dirname(fileURLToPath(import.meta.url))
const quelle = readFileSync(join(hier, '..', '..', 'proxy.ts'), 'utf8')

/**
 * **Alle Matcher-Zeilen, nicht die erste** (Schlusslesung 26.08.2026, F1).
 *
 * `find()` stand hier zuerst und war der stillste denkbare Fehler:
 * **Matcher-Einträge sind ODER-verknüpft.** Ein zweiter Eintrag kann ein
 * Asset wieder unter die Anmeldeprüfung ziehen — das CP-81-Symptom kehrt
 * zurück —, und der Test bliebe grün, weil er nur den ersten auswertet.
 * Lieber laut abbrechen und den Test umbauen lassen, als eine Zusicherung
 * geben, die nur die halbe Konfiguration deckt.
 */
const literale = quelle
  .split('\n')
  .map((z) => z.trim())
  .filter((z) => z.startsWith("'/") && z.endsWith("',"))

if (literale.length === 0) {
  throw new Error(
    'Matcher-Literal in proxy.ts nicht gefunden. Wurde der Ausdruck umgebaut? ' +
      'Dann gehört dieser Test mit umgebaut — nicht gelöscht.'
  )
}

if (literale.length > 1) {
  throw new Error(
    `proxy.ts hat ${literale.length} Matcher-Eintraege, dieser Test prueft einen.\n` +
      'Matcher-Eintraege sind ODER-verknuepft: ein zweiter kann einen Pfad wieder\n' +
      'unter die Anmeldepruefung ziehen, ohne dass die Zusicherungen hier es merken.\n' +
      'Den Test auf die ODER-Semantik umbauen — nicht diese Pruefung entfernen.\n' +
      `Gefunden:\n${literale.map((l) => '  ' + l).join('\n')}`
  )
}

const literal = literale[0]

/** Der String, wie ihn die Laufzeit sieht — nicht, wie er dasteht. */
const matcher = new Function(`return ${literal.replace(/,$/, '')}`)() as string

const regex = new RegExp(`^${matcher}$`)

/**
 * `true` = die Middleware läuft für diesen Pfad (Anmeldeprüfung + Session-
 * Refresh). `false` = sie wird übersprungen.
 */
const greift = (pfad: string) => regex.test(pfad)

let fehler = 0
function pruefe(pfad: string, erwartet: boolean, warum: string) {
  const ist = greift(pfad)
  if (ist !== erwartet) {
    fehler++
    console.error(
      `  FEHLER  ${pfad}\n` +
        `          erwartet: Middleware ${erwartet ? 'greift' : 'wird übersprungen'}\n` +
        `          ist:      Middleware ${ist ? 'greift' : 'wird übersprungen'}\n` +
        `          ${warum}`
    )
  }
}

// ---------------------------------------------------------------------------
// Die Freigabe: was ohne Anmeldung erreichbar sein MUSS
// ---------------------------------------------------------------------------
// Das Manifest holt Chrome grundsätzlich ohne Cookies; ohne es liefert „Zum
// Homescreen hinzufügen" eine Verknüpfung statt einer App (CP-81).
pruefe('/manifest.json', false, 'PWA-Manifest — Chrome holt es ohne Cookies')
pruefe('/sw.js', false, 'Service Worker — wird registriert, bevor etwas geladen ist')
pruefe('/icons/icon-192.png', false, 'App-Icon, im Manifest referenziert')
pruefe('/icons/icon-maskable-512.png', false, 'App-Icon')
pruefe('/leaflet/marker-icon.png', false, 'Kartenmarke')
pruefe('/favicon.ico', false, 'Browser-Tab-Symbol')
pruefe('/_next/static/chunks/main.js', false, 'Build-Artefakt')
pruefe('/_next/image', false, 'Bildoptimierung')
pruefe('/api/push/send', false, 'API-Route, eigene Prüfung im Handler')
pruefe('/api/validate-invite', false, 'API-Route')

// ---------------------------------------------------------------------------
// Die Gegenbeispiele der Fremdprüfung — sie MÜSSEN durch die Anmeldeprüfung
// ---------------------------------------------------------------------------
// Heute trifft keiner dieser Pfade eine Route; sie liefern 404. Genau darin
// liegt die Falle: ein Ausschluss, der breiter ist als gemeint, sieht aus wie
// ein enger Ausschluss. Wer später eine Route mit einem solchen Namen anlegt,
// bekommt sie ohne Anmeldung ausgeliefert und hat nichts falsch gemacht.
pruefe('/manifestXjson', true, 'Punkt als Platzhalter — Codex 26.08.2026')
pruefe('/swXjs', true, 'Punkt als Platzhalter')
pruefe('/faviconXico', true, 'Punkt als Platzhalter, VORBESTEHEND seit jeher')
pruefe('/manifest.jsonx', true, 'kein Anker am Pfadende')
pruefe('/sw.jsx', true, 'kein Anker am Pfadende')
pruefe('/sw.js/x', true, 'kein Anker am Pfadende')
pruefe('/apixyz', true, 'Präfix ohne Segmentgrenze, VORBESTEHEND seit jeher')
pruefe('/iconsX/bild.png', true, 'Präfix ohne Segmentgrenze')
pruefe('/leafletX/bild.png', true, 'Präfix ohne Segmentgrenze')
pruefe('/_next/staticX/x.js', true, 'Präfix ohne Segmentgrenze')

// ---------------------------------------------------------------------------
// Positivkontrolle — ohne sie misst der Test womöglich gar nichts
// ---------------------------------------------------------------------------
pruefe('/zentrale', true, 'Portal — die Anmeldeprüfung ist der ganze Zweck')
pruefe('/zentrale/revier', true, 'Portal')
pruefe('/app', true, 'Feld-App')
pruefe('/app/hunt/abc', true, 'Feld-App')
pruefe('/', true, 'Wurzel')

// ---------------------------------------------------------------------------
// Der Riegel gegen die Escape-Falle, ausdrücklich und einzeln
// ---------------------------------------------------------------------------
// Die Prüfungen oben fangen sie mit ab. Diese Zeile sagt einem künftigen Leser,
// WORAN es lag, statt ihn aus einem fehlgeschlagenen Pfad zurückrechnen zu
// lassen.
if (!matcher.includes('\\.')) {
  fehler++
  console.error(
    '  FEHLER  Der ausgewertete Matcher enthält keinen escapten Punkt.\n' +
      '          In der .ts-Datei muss `\\\\.` stehen, nicht `\\.` — sonst\n' +
      '          verschluckt der String-Parser den Backslash und der Punkt ist\n' +
      '          wieder ein Platzhalter für jedes Zeichen.'
  )
}

if (fehler > 0) {
  console.error(`\nproxy-matcher: ${fehler} Zusicherung(en) verletzt`)
  process.exit(1)
}
console.log('proxy-matcher: Auth-Grenze haelt, 26 Faelle')
