// Gegenprobe fuer den Lesepfad der Revierzentrale. Kein Test-Runner im Repo,
// deshalb ein eigenstaendiges Skript (Muster: grenze.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/laden.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import { geladen, vollstaendig } from './laden.ts'

const zeilen = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

// --- geladen(): unveraendert ---
assert.throws(
  () => geladen({ data: null, error: { message: 'kaputt' } }, 'Reviere'),
  /Reviere konnten nicht geladen werden: kaputt/
)
assert.deepEqual(geladen({ data: null, error: null }, 'Reviere'), [])

// --- vollstaendig(): der Fehlerweg wirft zuerst ---
// Wichtig, weil `count` im Fehlerfall null ist und der Zaehlvergleich dann
// nichts mehr faengt. Der Ladefehler darf nicht als leere Liste durchkommen.
assert.throws(
  () => vollstaendig({ data: null, error: { message: 'kaputt' }, count: null }, 'Zahlungen'),
  /Zahlungen konnten nicht geladen werden: kaputt/
)

// --- Riegel 1: der Zaehler sagt, dass Zeilen fehlen ---
assert.throws(
  () => vollstaendig({ data: zeilen(1000), error: null, count: 1200 }, 'Chronik'),
  /Chronik: 1000 von 1200 Zeilen geladen/
)

// **Luecke 1, und das ist der REALISTISCHE Abschneidefall** (Schlusslesung
// 08.08.2026): wenn eine Tabelle das Limit zum ersten Mal reisst, steht dort
// `count = 1001, length = 1000` — nicht 1200. Ohne diese Zeile bliebe ein
// `zeilen.length < count - 1` gruen.
assert.throws(
  () => vollstaendig({ data: zeilen(1000), error: null, count: 1001 }, 'Chronik'),
  /Chronik: 1000 von 1001 Zeilen geladen/
)

// **NaN ist kein Zaehler** (Schlusslesung 08.08.2026). supabase-js rechnet
// `parseInt(contentRange[1])` ohne Pruefung; bei `Content-Range: 0-999/*` ist
// das NaN. Mit `count != null` statt `Number.isFinite` waere der Zweig
// betreten, der Vergleich falsch und Riegel 2 uebersprungen worden — die
// Funktion waere hier SCHWAECHER gewesen als der handgebaute Riegel, den sie
// ersetzt.
assert.throws(
  () => vollstaendig({ data: zeilen(1000), error: null, count: NaN }, 'Chronik'),
  /Chronik: 1000 Zeilen ohne Zähler/
)

// --- Riegel 2: die Zeilenzahl allein, OHNE Zaehler ---
// **Das ist die Luecke, wegen der die Funktion existiert.** Fehlt der
// `Content-Range`-Header, ist `count` null und Riegel 1 faellt lautlos durch;
// bis zum 08.08.2026 stand an zwei der drei Aufrufstellen nur er.
assert.throws(
  () => vollstaendig({ data: zeilen(1000), error: null, count: null }, 'Chronik'),
  /Chronik: 1000 Zeilen ohne Zähler — das ist der PostgREST-Default/
)

// **Der Zaehler schlaegt den Verdacht.** 1000 gelieferte Zeilen bei
// `count: 1000` sind nachweislich vollstaendig — hier darf NICHT geworfen
// werden (Fremdpruefung 08.08.2026, F2). Der erste Entwurf tat es doch und
// haette eine korrekte Seite abgeschossen.
assert.equal(vollstaendig({ data: zeilen(1000), error: null, count: 1000 }, 'Chronik').length, 1000)
assert.equal(vollstaendig({ data: zeilen(1001), error: null, count: 1001 }, 'Chronik').length, 1001)

// --- Was durchgehen MUSS ---
// Ohne diese prueft die Datei nur, dass etwas wirft.
assert.equal(vollstaendig({ data: zeilen(124), error: null, count: 124 }, 'Strecke').length, 124)
assert.equal(vollstaendig({ data: zeilen(999), error: null, count: null }, 'Strecke').length, 999)
assert.deepEqual(vollstaendig({ data: null, error: null, count: 0 }, 'Strecke'), [])

// **Durchgereicht wird DIESELBE Liste, nicht irgendeine gleicher Laenge.**
// Ohne diese Zusicherung bliebe eine kaputte Fassung gruen, die Ersatzzeilen
// zurueckgibt — jede Pruefung oben zaehlt nur (Fremdpruefung 08.08.2026, F6).
//
// **Beide Rueckgabepfade, nicht nur einer** (Schlusslesung 08.08.2026): die
// Funktion hat seit dem F2-Fix zwei `return`, und die erste Fassung dieser
// Zusicherung deckte nur den mit Zaehler ab. `return zeilen.map(() => ({}))`
// auf dem anderen waere gruen geblieben.
const daten = zeilen(3)
assert.equal(vollstaendig({ data: daten, error: null, count: 3 }, 'Strecke'), daten)
assert.equal(vollstaendig({ data: daten, error: null, count: null }, 'Strecke'), daten)
