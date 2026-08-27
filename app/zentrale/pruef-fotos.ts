/**
 * Schadensfotos am Prüfeintrag — die Logik, die das Portal dafür braucht.
 *
 * **Migration 118 zieht die Grenze in der Datenbank:** `map_object_photos`
 * ohne `check_id` ist ein Objektfoto („so sieht der Stand aus"), mit
 * `check_id` ein Schadensfoto zu genau dieser Prüfung. Diese Datei zieht
 * dieselbe Grenze im Client — an einer Stelle, damit sie nicht in drei
 * Aufrufern einzeln entsteht.
 *
 * **Bewusst OHNE jeden Import**, wie `schreiben.ts` und `objekte.ts` aus
 * demselben Grund: so ist sie mit `node --experimental-strip-types` prüfbar,
 * ohne Pfad-Alias, Env-Variablen oder Netz (s. `pruef-fotos.selftest.ts`).
 * Den Supabase-Client baut der Aufrufer.
 *
 * **Die Regel, unter der das Ganze steht, ist Moritz' Satz vom 22.08.2026:**
 *
 * > *„im Wald ist der Empfang schlecht, und eine Meldung, die am Upload
 * > hängenbleibt, ist schlechter als eine ohne Bild."*
 *
 * Das Bild wird **angeboten, nie verlangt** — dieselbe Regel wie beim Melden
 * einer Erlegung: verhindert wird nie, ausgewiesen schon. Am Schreibtisch ist
 * der Empfang zwar besser als im Wald, aber die Regel hängt nicht am Empfang:
 * eine Prüfung, die an einem Bild scheitert, ist eine Prüfung, die niemand
 * einträgt.
 */

/* ── Die Grenzen des Buckets ────────────────────────────────────────────── */

/**
 * **Zeichengleich die Grenzen von `app-photos`**, gegen die Produktion
 * gelesen am 27.08.2026: `file_size_limit = 5242880`,
 * `allowed_mime_types = {image/jpeg, image/png, image/webp}`.
 *
 * **Warum der Client das nachbaut, statt den Storage absagen zu lassen:** die
 * Absage kommt sonst als roher Fehlertext aus dem SDK und landet ungefiltert
 * vor dem Nutzer. Dieselbe Entscheidung wie nativ (`fotos.ts:36-40`), aus
 * demselben Grund — und die PWA ist die Ausnahme, die es NICHT tut: sie
 * verlässt sich darauf, dass `PhotoCapture` alles nach JPEG konvertiert und
 * auf 1,2 MB drückt. Das stimmt heute; es ist aber eine Zusage einer anderen
 * Komponente und keine Prüfung.
 *
 * ⚠ **Eine Kopie bleibt eine Kopie.** Ändert jemand die Bucket-Grenzen, ist
 * diese Zeile still falsch — und zwar in die harmlosere Richtung (der Client
 * lehnt ab, was der Server genommen hätte). Der Selbsttest hält die Werte
 * fest, damit die Änderung wenigstens auffällt.
 */
export const FOTO_MAX_BYTES = 5 * 1024 * 1024

export const FOTO_MIME: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

/**
 * ⚠ **Die Naht dahinter, benannt statt geschlossen** (Schlusslesung
 * 27.08.2026, F8 — der OFFENE Punkt): `FOTO_MIME` spiegelt die
 * BUCKET-Grenzen, `uploadPhoto()` (`src/lib/photos/upload.ts`, fremder
 * Besitz) verdrahtet aber `contentType: 'image/jpeg'` und die Endung `.jpg`
 * **hart**. Ein durchgelassenes PNG landete also falsch etikettiert im
 * Bucket.
 *
 * Heute unerreichbar, weil `PhotoCapture` jede Auswahl nach JPEG wandelt —
 * **aber genau diese Art Zusage nennt der Kommentar oben „eine Zusage einer
 * anderen Komponente, keine Prüfung".** Der Einwand gilt spiegelbildlich für
 * die eigene Liste, und deshalb steht er hier statt nirgends.
 *
 * Nicht enger gefasst, weil die Konstante die Bucket-Grenzen abbildet und
 * der Selbsttest sie genau daran festnagelt; die Verengung auf JPEG gehört
 * an den Aufrufer, sobald es einen zweiten gibt.
 */

/**
 * Taugt diese Datei für den Bucket? Gibt den Grund zurück, nicht nur `false` —
 * „zu groß" und „falsches Format" verlangen verschiedene Handgriffe vom
 * Nutzer, und ein gemeinsames „geht nicht" verschweigt welchen.
 *
 * `null` heißt: nimmt der Bucket.
 */
export function fotoUntauglich(datei: { size: number; type: string }): string | null {
  if (!FOTO_MIME.includes(datei.type)) {
    return 'Nur JPEG, PNG oder WebP. Ein HEIC vom iPhone wird beim Auswählen umgewandelt — hier kam keines an.'
  }
  if (datei.size > FOTO_MAX_BYTES) {
    const mb = (datei.size / 1024 / 1024).toFixed(1)
    return `Das Bild ist ${mb} MB groß, erlaubt sind 5 MB.`
  }
  return null
}

/**
 * Was `PhotoCapture` wirft, in verständliches Deutsch.
 *
 * **Der Anlass ist gemessen** (Browser-Prüfung 27.08.2026, Punkt 8): eine
 * Textdatei im Dateidialog erzeugte die Meldung **„The file given is not an
 * image"** — wörtlich durchgereicht aus `browser-image-compression`, mitten in
 * einer sonst durchgehend deutschen Oberfläche. Der `onError`-Zweig setzte
 * blind `e.message`.
 *
 * **Warum `fotoUntauglich()` das nicht abfängt:** die Bibliothek wirft, BEVOR
 * `onCapture` je feuert. Meine Prüfung sitzt hinter einer Tür, durch die diese
 * Datei nie kommt. Zwei Wege, zwei Meldungen — und nur einer war übersetzt.
 *
 * **Praktisch selten und trotzdem falsch:** der Dateidialog filtert bereits
 * (`accept="image/*,.heic,.heif"`), es trifft nur, wer auf „Alle Dateien"
 * umschaltet. Ein englischer Satz aus einer fremden Bibliothek ist deshalb
 * kein Ausfall, aber er ist die Stelle, an der die Oberfläche aufhört, die
 * eigene zu sein.
 *
 * Unbekannte Fehler bekommen einen allgemeinen Satz statt des Originaltexts:
 * die Bibliothek verspricht nirgends deutsche oder auch nur stabile
 * Meldungen. Der Originaltext gehört in die Konsole, nicht vor den Nutzer.
 */
export function bildWahlFehler(rohMeldung: string): string {
  if (/not an image/i.test(rohMeldung)) {
    return 'Diese Datei ist kein Bild. Erlaubt sind JPEG, PNG und WebP.'
  }
  return 'Das Bild konnte nicht vorbereitet werden. Bitte ein anderes wählen.'
}

/* ── Zuordnung Foto → Prüfung ───────────────────────────────────────────── */

/**
 * Das Minimum, das eine Fotozeile mitbringen muss, um zugeordnet zu werden.
 *
 * Generisch statt konkret, damit die Datei importfrei bleibt — dasselbe Motiv
 * wie bei `ueberlagert()` in `objekte.ts`.
 */
export type FotoZeile = { check_id: string | null }

/**
 * Die Schadensfotos je Prüfung, aus EINER Abfrage über alle Fotos des Objekts.
 *
 * **Warum eine Abfrage und nicht eine je Historienzeile:** die Historie zeigt
 * bis zu `HISTORIE_MAX` Einträge; je Zeile eine Abfrage wären ebenso viele
 * Rundreisen für eine Tabelle mit derzeit 189 Zeilen insgesamt. Die Fotos
 * eines Objekts sind wenige, sie kommen zusammen.
 *
 * **Die Zuordnung entscheidet `check_id`, nicht die Reihenfolge und nicht eine
 * Einbettung** — wörtlich die Lehre aus dem nativen Weg
 * (`objekt-fotos.ts:139-144`): bliebe die Prüfzeile durch RLS aus, wäre ein
 * Schadensfoto sonst still zu einem Objektfoto geworden.
 *
 * Zeilen ohne `check_id` fallen heraus. Das sind die 185 Objektfotos aus der
 * PWA; sie gehören in die Galerie am Objekt, nicht an eine Prüfung.
 */
export function nachPruefung<T extends FotoZeile>(
  fotos: readonly T[],
): ReadonlyMap<string, T[]> {
  const gruppen = new Map<string, T[]>()
  for (const foto of fotos) {
    if (foto.check_id === null) continue
    const bisher = gruppen.get(foto.check_id)
    if (bisher) bisher.push(foto)
    else gruppen.set(foto.check_id, [foto])
  }
  return gruppen
}

/* ── Der Pfad im Bucket ─────────────────────────────────────────────────── */

/**
 * **Der Pfad IST die Berechtigung** (Migration 083): `app_photos_read` liest
 * `foldername(name)[2]` und kennt nur `map_object | hunt | kill | wild_event`;
 * alles andere ist `false`. `foldername(name)[1]` muss die eigene `uid` sein,
 * sonst greift `app_photos_insert` nicht.
 *
 * ⚠ **Die Falle, die nativ ausdrücklich dokumentiert ist** (`objekt-fotos.ts`,
 * 083 §189-192): die Lesepolicy erlaubt ZUSÄTZLICH `foldername[1] = auth.uid()`.
 * Ein falsch benannter Ordner ist damit **für den Hochladenden sichtbar und
 * für jeden anderen unsichtbar** — „im Einzeltest grün, beim ersten Mitjäger
 * kaputt". Deshalb steht die Art hier als Konstante und nicht als Parameter.
 *
 * **Gebaut wird der Pfad trotzdem nicht hier**, sondern von `uploadPhoto()`
 * (`src/lib/photos/upload.ts`) — es gibt ihn schon, er ist der einzige
 * Upload-Weg der PWA, und ein zweiter wäre eine zweite Stelle, an der diese
 * Falle zuschlagen kann. Diese Konstante ist das Argument dorthin.
 */
export const FOTO_ART = 'map_object'

/* ── Was die Anzeige sagt, wenn etwas schiefging ────────────────────────── */

/**
 * Der Satz nach dem Eintragen — **er trennt, was steht, von dem, was fehlt.**
 *
 * **Das ist der Kern der ganzen Datei.** Die Prüfzeile wird zuerst
 * geschrieben, das Bild danach; anders geht es nicht, denn vor der Prüfzeile
 * gibt es keine `check_id`, an die ein Schadensfoto gehören könnte
 * (dieselbe Reihenfolge wie nativ, `check-outbox.ts:999-1000`). Scheitert der
 * Upload danach, ist die Meldung **trotzdem gültig** — und ein „Eingetragen ✓"
 * allein wäre dann eine Lüge über das Bild.
 *
 * **`map_object_checks` hat keine DELETE-Policy** (066, append-only). Ein
 * Rücknehmen der Prüfzeile ist also nicht bloß unerwünscht, es ist nicht
 * möglich. Um so wichtiger, dass die Anzeige den Teilerfolg benennt, statt ihn
 * zu glätten: sonst sucht jemand später ein Bild, das nie ankam.
 *
 * Der S4-Fall in Reinform — ein Fehler, der sich als gültige Auskunft liest.
 */
export function eintragSatz(bild: 'keins' | 'da' | 'fehlt'): string {
  switch (bild) {
    case 'keins':
      return 'Eingetragen ✓'
    case 'da':
      return 'Eingetragen ✓ — mit Bild'
    case 'fehlt':
      /**
       * ⚠ **Hier stand „das Bild bitte erneut auswählen", und das war eine
       * Einladung zum Schaden** (Fremdprüfung 27.08.2026, A-P1): es gibt
       * keinen Weg, ein Bild zu einer BESTEHENDEN Prüfung nachzureichen.
       * Wer der Aufforderung folgte, trüge die Prüfung ein zweites Mal ein —
       * und `map_object_checks` hat keine DELETE-Policy, die Dublette bliebe
       * für immer im Protokoll stehen.
       *
       * Der Satz sagt deshalb jetzt, was wirklich gilt, und rät ausdrücklich
       * ab. Ein Nachreichweg ist Backlog, nicht V1.
       *
       * ⚠ **Der FIX auf A-P1 trug denselben Fehler ein zweites Mal**
       * (Schlusslesung 27.08.2026, F5): er endete auf „Das Bild lässt sich in
       * der Feld-App nachtragen." **Auch diesen Weg gibt es nicht.**
       * `ladeSchadensbildHoch()` ruft dort ausschließlich die gerätelokale
       * Outbox für ihre EIGENEN Einträge; der einzige Bildweg der Oberfläche
       * ist `SchadenFormular` → `melde()`, und der legt eine **neue**
       * Prüfzeile an. Der Satz schickte den Nutzer also genau in die zweite
       * Prüfzeile, vor der sein eigener erster Halbsatz warnt — durch die
       * andere Tür.
       *
       * **Das ist Auslöser 1 der Schlusslesung in Reinform:** Code, der nach
       * dem Review entsteht, ist per Konstruktion ungeprüft. Der Fix auf
       * einen Befund war selbst der nächste Befund.
       */
      return 'Eingetragen ✓ — die Prüfung gilt, aber das Bild wurde nicht gespeichert. Nicht erneut eintragen: das erzeugt eine zweite Prüfzeile, die niemand löschen kann. Ein Bild zu einer bestehenden Prüfung nachzureichen, geht derzeit nirgends.'
  }
}

/**
 * Die Zeile unter einem Schadensfoto in der Historie.
 *
 * **Sie nennt den Zustand der Prüfung, an der das Bild hängt — nicht den
 * heutigen Zustand des Objekts.** Ein Bild vom Mai gehört zu der Sperre vom
 * Mai, auch wenn der Stand längst wieder frei ist. Dieselbe Entscheidung wie
 * nativ (`ObjektBilder.tsx`, `bildZeile`), und aus demselben Grund.
 *
 * **Alle drei Zustände ausgeschrieben, auch `ok`:** der Fremdschlüssel aus 118
 * schränkt den Status nicht ein, ein Bild DARF an einer `ok`-Prüfung hängen.
 *
 * ⚠ **Hier stand „nativ entsteht das nie und hier auch nicht" — die zweite
 * Hälfte war falsch** (Fremdprüfung 27.08.2026, A-P9, der OFFENE Punkt).
 * Im Portal wird die Bildwahl **unabhängig vom Status** angeboten, und der
 * voreingestellte Status ist `ok`: ein Bild an einer heilen Prüfung ist hier
 * nicht bloß erlaubt, es ist einen Klick entfernt. **Das ist gewollt** — wer
 * dokumentieren will, dass ein Stand in Ordnung IST, soll das dürfen; der
 * `alt`-Text nennt es dann „Bild zur Prüfung" und nicht „Schadensbild".
 *
 * Ein Rückfall auf „Mangel" wäre eine Behauptung über einen Schaden, den
 * niemand gemeldet hat — und er träfe jetzt einen Fall, den es wirklich gibt.
 */
export function fotoAlt(status: string, wann: string): string {
  switch (status) {
    case 'gesperrt':
      return `Schadensbild zur Sperre vom ${wann}`
    case 'mangel':
      return `Schadensbild zum Mangel vom ${wann}`
    /**
     * `ok` und der unbekannte Fall fallen zusammen, und das ist Absicht statt
     * Nachlässigkeit (Ponytail-Lesung): beide sollen KEINEN Schaden
     * behaupten. Zwei getrennte Zweige mit identischem Rumpf sähen aus, als
     * stünde da eine Unterscheidung, die es nicht gibt.
     */
    case 'ok':
    default:
      return `Bild zur Prüfung vom ${wann}`
  }
}
