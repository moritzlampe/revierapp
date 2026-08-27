// Gegenprobe fuer die Schadensfotos am Pruefeintrag (Migration 118).
// Kein Test-Runner im Repo, deshalb ein eigenstaendiges Skript:
//
//   node --experimental-strip-types app/zentrale/pruef-fotos.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Wird vom Sammel-Script `npm run selftest` per Glob mitgenommen.
import assert from 'node:assert/strict'
import {
  FOTO_ART,
  bildWahlFehler,
  FOTO_MAX_BYTES,
  FOTO_MIME,
  eintragSatz,
  fotoAlt,
  fotoUntauglich,
  nachPruefung,
} from './pruef-fotos.ts'

// --- Die Bucket-Grenzen, gegen die Produktion gelesen am 27.08.2026 ---
//
// **Ausgeschrieben statt aus dem Modul gerechnet, und das ist der Riegel:**
// waere es dieselbe Rechnung wie im Code, ginge eine versehentliche Aenderung
// hier genauso durch. So faellt sie als roter Test auf. Die Zahlen stammen aus
// `storage.buckets` (`file_size_limit`, `allowed_mime_types`), nicht aus dem
// Gedaechtnis.
assert.equal(FOTO_MAX_BYTES, 5242880, 'app-photos: file_size_limit')
assert.deepEqual([...FOTO_MIME], ['image/jpeg', 'image/png', 'image/webp'])

// **`map_object` ist Teil der BERECHTIGUNG, nicht der Ordnung** (083): die
// Lesepolicy wertet `foldername(name)[2]` aus und kennt genau vier Arten.
// Ein Tippfehler hier erzeugt Bilder, die nur der Hochladende sieht — im
// Einzeltest gruen, beim ersten Mitjaeger kaputt.
assert.equal(FOTO_ART, 'map_object')

// --- Taugt die Datei fuer den Bucket? ---
assert.equal(fotoUntauglich({ size: 1_000_000, type: 'image/jpeg' }), null)
assert.equal(fotoUntauglich({ size: 1, type: 'image/png' }), null)
assert.equal(fotoUntauglich({ size: 1, type: 'image/webp' }), null)

// HEIC ist der praktische Fall: jedes iPhone-Foto ist eines, und der Bucket
// nimmt es nicht. `PhotoCapture` wandelt vorher um — kommt trotzdem eines an,
// muss der Grund im Text stehen und nicht als roher SDK-Fehler erscheinen.
assert.match(String(fotoUntauglich({ size: 1, type: 'image/heic' })), /JPEG, PNG oder WebP/)

// Die Grenze ist scharf: genau `FOTO_MAX_BYTES` geht noch, ein Byte mehr nicht.
assert.equal(fotoUntauglich({ size: FOTO_MAX_BYTES, type: 'image/jpeg' }), null)
assert.match(String(fotoUntauglich({ size: FOTO_MAX_BYTES + 1, type: 'image/jpeg' })), /5 MB/)

// **Der Typ wird VOR der Groesse geprueft.** Eine 9-MB-HEIC-Datei ist beides;
// die Meldung „zu gross" schickte den Nutzer dann zum Verkleinern, obwohl das
// Format das Problem ist und Verkleinern nichts hilft.
assert.match(
  String(fotoUntauglich({ size: 9_000_000, type: 'image/heic' })),
  /JPEG, PNG oder WebP/,
  'Bei zwei Maengeln gewinnt der, den der Nutzer beheben kann',
)

// --- Was PhotoCapture wirft, in Deutsch ---
//
// **Der Text ist GEMESSEN, nicht geraten** (Browser-Pruefung 27.08.2026,
// Punkt 8): eine Textdatei erzeugte woertlich „The file given is not an image"
// aus `browser-image-compression`, und der `onError`-Zweig setzte ihn
// unveraendert vor den Nutzer.
assert.match(bildWahlFehler('The file given is not an image'), /kein Bild/)
assert.match(bildWahlFehler('The file given is not an image'), /JPEG, PNG und WebP/)

// Gross-/Kleinschreibung darf nicht entscheiden — die Bibliothek verspricht
// ihren Wortlaut nirgends.
assert.match(bildWahlFehler('THE FILE GIVEN IS NOT AN IMAGE'), /kein Bild/)

// **Ein unbekannter Fehler bekommt einen ALLGEMEINEN deutschen Satz, nie den
// Originaltext.** Sonst waere die Uebersetzung nur fuer den einen bekannten
// Fall gebaut und der naechste englische Satz stuende wieder da.
const unbekannt = bildWahlFehler('heic2any: unexpected EOF at chunk 3')
assert.equal(/heic2any/.test(unbekannt), false, 'Kein Originaltext vor dem Nutzer')
assert.equal(/EOF/.test(unbekannt), false)
assert.match(unbekannt, /nicht vorbereitet werden/)

// Auch der leere Fall faellt auf die allgemeine Fassung, nicht auf nichts.
assert.match(bildWahlFehler(''), /nicht vorbereitet werden/)

// --- Zuordnung Foto → Pruefung ---
const fotos = [
  { id: 'a', check_id: 'p1' },
  { id: 'b', check_id: null }, // Objektfoto aus der PWA
  { id: 'c', check_id: 'p1' },
  { id: 'd', check_id: 'p2' },
]
const gruppen = nachPruefung(fotos)

assert.equal(gruppen.size, 2, 'Zwei Pruefungen tragen Bilder, nicht drei')
assert.deepEqual(gruppen.get('p1')?.map((f) => f.id), ['a', 'c'])
assert.deepEqual(gruppen.get('p2')?.map((f) => f.id), ['d'])

// **Der Fall, der das Modul rechtfertigt: `check_id is null` faellt HERAUS.**
// Die 185 Objektfotos aus der PWA gehoeren in die Galerie am Objekt. Landeten
// sie unter einer Pruefung, behauptete die Historie einen Schaden, den niemand
// gemeldet hat — und zwar an der aeltesten Pruefzeile, weil Reihenfolge dann
// entschiede statt `check_id`.
assert.equal([...gruppen.values()].flat().some((f) => f.check_id === null), false)

// Die Reihenfolge innerhalb einer Gruppe bleibt die der Eingabe. Der Aufrufer
// sortiert (`created_at desc`); ein Umsortieren hier waere eine zweite
// Meinung ueber dieselbe Sache.
//
// ⚠ **Hier stand ein Test, der die Reihenfolge NICHT prueft** (Fremdpruefung
// 27.08.2026, B-P8): er verglich die LAENGE der Gruppe. Eine umgedrehte
// Reihenfolge waere gruen geblieben — der Test behauptete eine Zusage, die er
// nicht hielt. Genau die Bauform, gegen die die Sabotagelaeufe da sind, nur
// eine Ebene hoeher: nicht der Code war blind, sondern seine Pruefung.
const reihenfolge = nachPruefung([
  { id: 'erst', check_id: 'x' },
  { id: 'dann', check_id: 'x' },
  { id: 'zuletzt', check_id: 'x' },
])
assert.deepEqual(
  reihenfolge.get('x')?.map((f) => f.id),
  ['erst', 'dann', 'zuletzt'],
  'Die Eingabereihenfolge bleibt erhalten — der Aufrufer sortiert, nicht diese Funktion',
)

assert.equal(nachPruefung([]).size, 0)
assert.equal(nachPruefung([{ check_id: null }]).size, 0, 'Nur Objektfotos: keine Gruppe')

// --- Der Satz nach dem Eintragen ---
//
// **Die drei Faelle muessen UNTERSCHEIDBAR bleiben.** Das ist der ganze Zweck:
// die Pruefzeile steht zuerst, das Bild geht danach hoch, und `map_object_checks`
// hat keine DELETE-Policy — ein gescheiterter Upload laesst sich nicht
// zurueckdrehen. Ein gemeinsames „Eingetragen ✓" waere ein Fehler, der sich als
// gueltige Auskunft liest.
const saetze = [eintragSatz('keins'), eintragSatz('da'), eintragSatz('fehlt')]
assert.equal(new Set(saetze).size, 3, 'Drei Ausgaenge, drei verschiedene Saetze')

// Alle drei sagen zuerst, dass die Pruefung STEHT — auch der Fehlerfall. Sie
// gilt naemlich, und wer nur „Fehler" liest, traegt sie ein zweites Mal.
for (const satz of saetze) assert.match(satz, /^Eingetragen ✓/)

// Und der Fehlerfall sagt zusaetzlich, was fehlt und was zu tun ist.
assert.match(eintragSatz('fehlt'), /Bild/)
assert.match(eintragSatz('fehlt'), /Pr(ü|ue)fung gilt/)

// ⚠ **Hier stand `assert.equal(/nicht hochgeladen/.test(eintragSatz('da')),
// false)` — eine VAKUUM-GRUENE Zusicherung** (Schlusslesung 27.08.2026, F6):
// die Wendung „nicht hochgeladen" kam in KEINEM der drei Saetze vor, seit der
// Fehlertext auf „nicht gespeichert" umgestellt wurde. Der Test haette auch
// gehalten, wenn `'da'` den kompletten Fehlertext truege.
//
// **Dieselbe Bauform, die B-P8 an zwei anderen Zeilen dieses Tests fand — und
// sie ist beim FIXEN entstanden:** der Text wurde geaendert, die Zusicherung
// darauf nicht nachgezogen. Jetzt prueft sie das Wort, das wirklich dort
// steht, und ist damit an den Text gebunden statt an eine Erinnerung daran.
assert.match(eintragSatz('fehlt'), /nicht gespeichert/)
assert.equal(/nicht gespeichert/.test(eintragSatz('da')), false)
assert.equal(/nicht gespeichert/.test(eintragSatz('keins')), false)

// **Der KERN des Satzes, festgenagelt** (Delta-Durchgang 27.08.2026,
// uebergreifender Punkt): geprueft wurden bisher nur Nebenwoerter — die
// eigentliche Warnung „nicht erneut eintragen" haette eine spaetere
// Textaenderung still entfernen koennen, ohne dass ein Test rot wird.
//
// **Genau die Bauform, durch die dieser Satz ueberhaupt zweimal falsch war.**
// `map_object_checks` hat keine DELETE-Policy: wer nach einem Bildfehler
// erneut eintraegt, erzeugt eine Dublette, die niemand mehr wegbekommt. Diese
// Warnung ist der teuerste Teil des Satzes und damit der, der eine Zusicherung
// verdient.
assert.match(eintragSatz('fehlt'), /[Nn]icht erneut eintragen/)
assert.match(eintragSatz('fehlt'), /zweite Pr(ü|ue)fzeile/)

// --- Der Alternativtext am Bild ---
//
// Er nennt den Zustand der PRUEFUNG, an der das Bild haengt — nicht den
// heutigen des Objekts. Ein Bild vom Mai gehoert zur Sperre vom Mai, auch wenn
// der Stand laengst wieder frei ist.
assert.equal(fotoAlt('gesperrt', '3. Mai'), 'Schadensbild zur Sperre vom 3. Mai')
assert.equal(fotoAlt('mangel', '3. Mai'), 'Schadensbild zum Mangel vom 3. Mai')

// **`ok` ist ausgeschrieben, und im Portal entsteht der Fall wirklich.**
// Die Bildwahl haengt dort an keinem Status, und `ok` ist die Voreinstellung:
// ein Bild an einer heilen Pruefung ist einen Klick entfernt (Fremdpruefung
// 27.08.2026, A-P9 — der Kommentar in `pruef-fotos.ts` behauptete vorher das
// Gegenteil). Nativ entsteht es nicht, das bleibt richtig.
// Ein Rueckfall auf „Mangel" waere eine Behauptung ueber einen Schaden, den
// niemand gemeldet hat — und er traefe jetzt einen Fall, den es gibt.
assert.equal(fotoAlt('ok', '3. Mai'), 'Bild zur Prüfung vom 3. Mai')
assert.equal(/Schaden/.test(fotoAlt('ok', '3. Mai')), false)

// Ein unbekannter Status (ein vierter Wert aus einer kuenftigen Migration)
// faellt auf die neutrale Fassung zurueck, nie auf eine der beiden Schadens-
// aussagen. Dieselbe Vorsicht wie bei `ampel()` in `wartung.ts`.
//
// ⚠ **Der Test prueft den TEXT, nicht bloss die Abwesenheit von „Schaden"**
// (Fremdpruefung 27.08.2026, B-P8): vorher waere jede beliebige Ausgabe gruen
// gewesen, solange das Wort fehlte — auch eine leere Zeichenkette oder das
// rohe Statuswort. Ein `alt`-Text, der nichts sagt, ist fuer ein Vorlesegeraet
// dasselbe wie kein Bild.
assert.equal(fotoAlt('gibtesnicht', '3. Mai'), 'Bild zur Prüfung vom 3. Mai')
assert.equal(fotoAlt('', '3. Mai'), 'Bild zur Prüfung vom 3. Mai')
assert.equal(/Schaden/.test(fotoAlt('gibtesnicht', '3. Mai')), false)
