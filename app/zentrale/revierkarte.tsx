'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { distanceInMeters, polygonAreaHectares } from '@/lib/geo-utils'
import { useBoundaryEditor } from '@/hooks/useBoundaryEditor'
import type { KarteProps, Punkt } from './revierkarte-map'
import { schreibe } from './schreiben'
import { ewktAus, nurEinRing, pruefeGrenze } from './grenze'
import {
  alsSpalten,
  ewktPunkt,
  ortUnveraendert,
  passtZurSuche,
  pruefeOrt,
  typLabel,
  ueberlagert,
  type ObjektEntwurf,
  type Ort,
  type Setzen,
} from './objekte'
import ObjektInspektor from './objekt-inspektor'

// react-leaflet fasst beim Import `window` an — ssr:false ist Pflicht, und
// next/dynamic mit ssr:false geht nur aus einer Client-Komponente heraus.
// Deshalb dieser dünne Mantel zwischen Server-Seite und Karte.
const Karte = dynamic(() => import('./revierkarte-map'), {
  ssr: false,
  loading: () => <div className="zentrale-karte-lade">Karte lädt …</div>,
})

/** Handler-Platzhalter, während ein Write läuft — der Entwurf bleibt sichtbar,
 *  darf sich aber nicht mehr ändern. Modulweit, damit die Referenz stabil ist. */
const nichts = () => {}

/** Breite der Objektspalte: Vorgabe, Grenzen, Tastaturschritt — in Pixeln. */
const SPALTE_STANDARD = 320
const SPALTE_MIN = 280
const SPALTE_MAX = 640
const SPALTE_SCHRITT = 24
/** Höchster Anteil an der Kastenbreite. Die Karte bleibt damit die Hauptfläche. */
const SPALTE_ANTEIL = 0.45

/**
 * Die einzige Stelle, die entscheidet, wie breit die Spalte sein darf.
 *
 * Die Obergrenze ist **relativ**, nicht absolut. Eine feste Zahl war beides
 * zugleich falsch (Moritz, 28.07.2026): 640 px sind im Vollbild auf 1512 px
 * knappe 42 % und wirken eng, eingebettet auf 1136 px aber über 56 % — die
 * Spalte nahm dort mehr als die halbe Karte. Und weil 640 überall erlaubt
 * blieb, kappte das Verlassen des Vollbilds gar nichts.
 *
 * `SPALTE_MAX` bleibt als Obergrenze darüber: ab etwa 1420 px Kastenbreite
 * bringt eine noch breitere Spalte nichts mehr, es sind ja nur drei Felder.
 *
 * Die Untergrenze sticht am Ende alles: in einem sehr schmalen Kasten ist eine
 * unbedienbare 200er-Spalte schlechter als eine, die etwas Karte kostet.
 */
function spaltenBreite(px: number, kastenBreite: number): number {
  const max = Math.min(SPALTE_MAX, kastenBreite * SPALTE_ANTEIL)
  return Math.round(Math.max(SPALTE_MIN, Math.min(px, max)))
}

/**
 * Drei Größen, wie bei YouTube: eingebettet · Kinomodus · Vollbild.
 *
 * Vollbild über die native Fullscreen-API — ESC, Zustandsverwaltung und
 * Bildschirmgröße macht der Browser. Kinomodus ist dagegen bewusst nur eine
 * CSS-Klasse: die Karte bleibt in der Seite, wird aber deutlich höher. Leaflet
 * misst sich bei beidem über den ResizeObserver in der Karte neu.
 *
 * Dazu seit Phase 3 der Editierzustand der Reviergrenze. Er liegt hier und nicht
 * in der Karte, weil er das Speichern kennt — die Karte stellt nur dar.
 */
export default function Revierkarte({
  grenze,
  punkte,
  revierId,
}: KarteProps & { revierId: string }) {
  const kasten = useRef<HTMLDivElement>(null)
  const [voll, setVoll] = useState(false)
  const [kino, setKino] = useState(false)

  const router = useRouter()
  const zeichner = useBoundaryEditor()
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [loeschFrage, setLoeschFrage] = useState(false)

  /**
   * Was zuletzt erfolgreich geschrieben wurde — `undefined` heißt „noch nichts".
   *
   * `router.refresh()` gibt kein Promise zurück, das Nachziehen der
   * Server-Komponente ist also nicht abwartbar. Ohne diesen Zwischenspeicher
   * zeigte die `grenze`-Prop unmittelbar nach dem Speichern noch den **alten**
   * Stand: ein sofortiger Klick auf „Grenze bearbeiten" lud die alte Geometrie,
   * und das nächste „Fertig" hätte den eigenen Speichervorgang zurückgedreht.
   * Nach einem Löschen hätte derselbe Ablauf die Grenze wieder auferstehen
   * lassen. Von Codex gefunden, 27.07.2026.
   *
   * Ein Revierwechsel setzt das zurück, weil `page.tsx` die Komponente mit
   * `key={revier.id}` neu aufbaut.
   */
  const [gespeichert, setGespeichert] = useState<[number, number][][] | null | undefined>(
    undefined,
  )
  const aktuelleGrenze = gespeichert !== undefined ? gespeichert : grenze

  const [auswahlId, setAuswahlId] = useState<string | null>(null)

  /**
   * Objekte, die in dieser Sitzung schon geschrieben wurden — aus demselben
   * Grund wie `gespeichert` oben: `router.refresh()` ist nicht abwartbar, und
   * bis die Server-Komponente nachgezogen hat, trüge die `punkte`-Prop noch den
   * alten Stand. Ohne das läge im Inspektor unmittelbar nach dem Speichern
   * wieder der alte Name.
   *
   * **Vollständige Zeilen, nicht nur die geänderten Felder.** Bis Schritt 3a
   * genügte ein Feld-Patch auf vorhandene IDs, weil sich nur Name, Typ und Notiz
   * ändern konnten. Mit 3b trägt derselbe Zwischenspeicher zwei weitere Fälle,
   * die ein Patch nicht kann: eine geänderte **Position** und eine **neue
   * Zeile**, die es in `punkte` noch gar nicht gibt. Ein neu angelegtes Objekt
   * wäre sonst bis zum Eintreffen der Server-Daten unsichtbar — man legt es an
   * und die Karte bleibt leer. Von Codex gefunden, 28.07.2026.
   *
   * **`null` heißt gelöscht (Schritt 3c).** Eine entfernte Zeile lässt sich mit
   * einer Überlagerung aus Vollzeilen nicht ausdrücken — es gibt nichts
   * hinzulegen, es muss etwas verschwinden. Der Grabstein ist der kleinste Weg
   * dorthin: derselbe Speicher, dieselbe Leerung beim nächsten Server-Stand, ein
   * Wert mehr. Ein zweites `geloescht: Set<string>` wäre ein zweiter Zustand,
   * der mit dem ersten widerspruchsfrei gehalten werden müsste — und genau daran
   * ist dieser Code schon zweimal gescheitert.
   */
  const [geschrieben, setGeschrieben] = useState<Record<string, Punkt | null>>({})
  // Gemerkt wird, was wirklich in der DB steht — also der getrimmte Wert aus
  // `alsSpalten`, nicht der rohe Formularinhalt. Sonst zeigte der Inspektor
  // nach dem Speichern ein Leerzeichen, das die DB gar nicht hat.
  // Das Zusammenführen selbst steht in `objekte.ts`: es hat mit dem Grabstein
  // einen Fall bekommen, den man falsch herum schreiben kann, ohne dass es
  // auffällt — und dort hängt ein Selbsttest daran.
  const aktuellePunkte = ueberlagert(punkte, geschrieben)

  /**
   * **Beide** Zwischenspeicher leeren, sobald **überhaupt** neue Server-Daten da
   * sind — nicht erst, wenn sie dem entsprechen, was hier geschrieben wurde.
   *
   * Der Unterschied ist der ganze Punkt (Codex, 27.07.2026): verglich man auf
   * Gleichheit, blieb der Eintrag genau dann liegen, wenn die Feld-App
   * zwischenzeitlich einen NEUEREN Stand geschrieben hatte. Der wäre dann bis
   * zum Revierwechsel von der eigenen älteren Fassung verdeckt gewesen — und
   * ein weiterer Write hätte auf dem veralteten Stand aufgesetzt.
   *
   * Die Prop wechselt ihre Referenz nur bei einer neuen Server-Auslieferung,
   * nicht bei jedem Rendern dieser Komponente. Der Zwischenspeicher überbrückt
   * also genau das, wofür er da ist: die Zeit bis `router.refresh()` ankommt.
   * Danach hat der Server recht, wessen Änderung es auch war.
   *
   * **`gespeichert` hängt seit Schritt 4 mit drin, und zwar an `punkte`, nicht
   * an `grenze`.** Vorher wurde es überhaupt nicht geleert: einmal gesetzt,
   * verdeckte es die `grenze`-Prop bis zum Revierwechsel oder Reload — also die
   * ganze Sitzung. Der Schaden wuchs in drei Stufen: die Karte zeigte die alte
   * Grenze, während die Kennzahl „Fläche" aus dem Server schon die neue trug;
   * „Grenze bearbeiten" lud den veralteten Ring; und „Fertig" schrieb ihn
   * zurück. Das ist E-R7 (last-write-wins) ohne die Milderung, die Objekte
   * durch `unveraendert()` haben.
   *
   * Die naheliegende Fassung — ein eigener Effekt an `[grenze]` — hatte ein Loch
   * (Codex, 29.07.2026): **`grenze` ist kein Melder für „neue Server-Daten",
   * weil `null` sich nicht von `null` unterscheidet.** Wer eine erste Grenze
   * zeichnet, während die Feld-App sie gleich wieder löscht, bekommt zweimal
   * `null` geliefert, die Abhängigkeit wechselt nie, und der lokal gezeichnete
   * Ring klebt weiter — „Bearbeiten → Fertig" ließe die gelöschte Grenze
   * wiederauferstehen. `punkte` kann das nicht: das Array entsteht in `page.tsx`
   * aus `objekte.reduce(…, [])` und ist bei **jeder** Auslieferung frisch, auch
   * wenn es leer ist. Ein Signal für beide Speicher ist außerdem eines statt
   * zweier — und der Fix für E-R8 unten trifft dann von selbst beide.
   *
   * ponytail: die Decke dieser Entscheidung ist ein Wettlauf, den 3b vergrößert
   * hat. Zwei Writes innerhalb einer Refresh-Umlaufzeit (~200 ms) — und die
   * Antwort des ERSTEN leert den Zwischenspeicher, obwohl schon der zweite
   * darin steht. Bis 3a war die Folge ein kurz veralteter Name; seit 3b kann
   * ein gerade angelegtes Objekt kurz von der Karte verschwinden, was
   * erschreckender aussieht; seit Schritt 4 kann auch die Grenze kurz auf den
   * alten Stand zurückfallen (Codex, 29.07.2026). Es heilt mit der nächsten
   * Antwort, und die DB ist die ganze Zeit richtig. Nicht behoben, weil es zwei
   * vollständige Eingaben in 200 ms braucht — praktisch unerreichbar. Ein
   * echter Fix bräuchte Folgenummern je Anfrage; nachziehen, wenn es je
   * auffällt (Backlog E-R8). Von Codex gefunden, 28.07.2026.
   */
  const ersterLauf = useRef(true)
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false
      return
    }
    setGeschrieben((v) => (Object.keys(v).length > 0 ? {} : v))
    setGespeichert((v) => (v !== undefined ? undefined : v))
  }, [punkte])

  /**
   * Wird gerade ein Objekt bearbeitet? Dann ist die Karte gesperrt.
   *
   * Symmetrisch zur umgekehrten Regel (beim Grenzenzeichnen verschwindet der
   * Inspektor). Ohne die Sperre hängte ein Klick auf einen anderen Marker oder
   * auf „Grenze bearbeiten" den Inspektor aus und verwarf den Entwurf
   * kommentarlos — im schlimmsten Fall mitten in einem laufenden Write, dessen
   * Fehlermeldung dann in einer nicht mehr sichtbaren Komponente landete. Für
   * den Nutzer sähe das aus wie ein Erfolg. Von Codex gefunden, 27.07.2026.
   */
  const [objektBearbeitung, setObjektBearbeitung] = useState(false)

  const [setzen, setSetzen] = useState<Setzen | null>(null)

  /**
   * Ein Riegel für **alle** anderen Wege, nicht einer je Knopf.
   *
   * Die erste Fassung sperrte nur „Grenze zeichnen/bearbeiten" — „Grenze löschen"
   * und „Wirklich löschen" blieben offen und schrieben mitten in einen offenen
   * Objektentwurf hinein (Moritz, 28.07.2026). „Behalten" bleibt bewusst draußen:
   * eine begonnene Rückfrage muss man auch dann wegklicken können.
   *
   * Mit 3b kommt `setzen` dazu, und der Name ist mitgewandert: der Wert sperrt
   * jetzt auch „Objekt anlegen" gegen einen offenen Positionsentwurf. Ein
   * Riegel, der als Ausdruck an einem Knopf steht, wird beim nächsten Knopf
   * vergessen — als benannter Wert an einer Stelle nicht.
   */
  const beschaeftigt = laeuft || objektBearbeitung || setzen !== null

  /**
   * Die Grenzen-Rückfrage räumen, wenn im Inspektor ein Modus aufgeht
   * (Schritt 4).
   *
   * `loeschFrage` steht bewusst NICHT in `beschaeftigt` — sonst sperrte
   * „Wirklich löschen" sich selbst. Sie muss deshalb geräumt werden, und die
   * Wege von hier aus tun das auch: `starten`, `anlegenStarten` und
   * `positionStarten` rufen alle `setLoeschFrage(false)`. Die Wege aus dem
   * **Kind** heraus können das nicht — „Bearbeiten" und „Löschen" im Inspektor
   * melden nur `objektBearbeitung` nach oben und wissen von der Rückfrage nichts.
   *
   * Ohne das blieb sie im Hintergrund stehen: ausgegraut neben dem
   * Objektformular (`disabled={beschaeftigt}` greift, seit 3c das Kind meldet)
   * — und **wieder scharf, sobald der Objektmodus endet**. Eine Rückfrage, die
   * der Nutzer vor Minuten geöffnet hat, wartet dann auf einen Klick, der ihr
   * nicht mehr gilt. Kein paralleler Write, aber derselbe Fehlertyp wie am
   * 29.07.2026: ein Riegel schützt nur die Zustände, die ihn erreichen — und
   * ein Zustand wird nur geräumt, wo jemand ihn kennt.
   */
  useEffect(() => {
    if (objektBearbeitung) setLoeschFrage(false)
  }, [objektBearbeitung])

  /**
   * Objektspalte ein- und ausklappen.
   *
   * Der Zustand liegt hier, weil auch der Ziehgriff daran hängt; der Schalter
   * selbst sitzt im Kopf der Spalte (`objekt-inspektor.tsx`). Eingeklappt bleibt
   * sie als schmale Leiste stehen — deshalb kann der Schalter darin wohnen, ohne
   * den Weg zurück mitzunehmen. Der Inhalt wird verborgen, nicht ausgehängt,
   * sonst wäre beim Wiederaufklappen der Suchbegriff weg.
   *
   * Gesperrt nur bei `objektBearbeitung`, nicht bei `laeuft`: ein laufender
   * Grenzen-Write hat mit der Spalte nichts zu tun, ein offener Objektentwurf
   * schon — der wäre nach dem Ausblenden unsichtbar und der Nutzer hielte ihn
   * für verworfen.
   */
  const [inspektorOffen, setInspektorOffen] = useState(true)

  /**
   * Der Suchbegriff liegt hier, nicht in der Spalte — weil das Suchfeld hier
   * liegt.
   *
   * Es steht in der Knopfleiste über der Karte und damit **außerhalb** von
   * allem, was ein- und ausklappt (Moritz, 28.07.2026). In der Spalte war es
   * zwangsläufig mit ihr weg, und genau das wollte der Ablauf nicht: über die
   * Karte schauen, „17a" tippen, Treffer sehen. Ein Suchfeld, das nur da ist,
   * wenn die Liste schon offen ist, hilft in dem Moment nicht.
   *
   * Bei **eingeklappter** Spalte stehen die Treffer direkt unter dem Feld, über
   * der Karte — die Spalte klappt dafür ausdrücklich NICHT auf (Moritz,
   * 28.07.2026). Wer über die Karte schaut und „17a" tippt, will den einen
   * Stand finden, nicht die halbe Karte wieder zugebaut bekommen. Erst der
   * Klick auf einen Treffer öffnet die Spalte, weil dort Foto und Notiz stehen.
   *
   * Ist die Spalte offen, stehen die Treffer in ihrer Liste; dann gibt es keine
   * zweite Anzeige.
   */
  const [suche, setSuche] = useState('')
  const sucheRef = useRef<HTMLInputElement>(null)
  const suchbegriff = suche.trim().toLowerCase()

  /**
   * ponytail: bei 8 Treffern abgeschnitten. „a" trifft in Söder 150 Objekte,
   * und eine 150 Zeilen lange Liste über der Karte wäre keine Hilfe, sondern
   * eine zweite Karte. Wie viele weggelassen wurden, steht darunter — stumm
   * abschneiden hieße, dem Nutzer eine vollständige Antwort vorzumachen.
   */
  const TREFFER_MAX = 8
  const treffer = suchbegriff
    ? aktuellePunkte.filter((p) => passtZurSuche(p.name, p.typ, suchbegriff))
    : []

  /**
   * Breite der Objektspalte, in Pixeln, gezogen am Griff links davon.
   *
   * Bewusst in allen drei Kartengrößen, nicht nur im Vollbild: die Beschränkung
   * wäre mehr Code als der Verzicht darauf, und eine Spalte, die sich mal ziehen
   * lässt und mal nicht, ist die überraschendere Variante.
   *
   * Leaflet braucht hier nichts: die Bühne schrumpft mit, und der
   * ResizeObserver in `revierkarte-map.tsx` hängt am Kartencontainer.
   */
  const [inspektorBreite, setInspektorBreite] = useState(SPALTE_STANDARD)
  const [zieht, setZieht] = useState(false)

  const begrenzt = (px: number) => spaltenBreite(px, kasten.current?.clientWidth ?? 1200)

  /**
   * Nachkappen, wenn sich der Kasten ändert — Vollbild verlassen, Kinomodus,
   * Fenster kleiner ziehen.
   *
   * Vorher zog den dauerhaften Riegel ein `max-width` im CSS. Das sah richtig
   * aus, hatte aber **zwei Wahrheiten**: die sichtbare Breite war gekappt, der
   * gespeicherte Wert nicht. Alles, was mit dem Wert rechnete, lag daneben —
   * der Ziehgriff hing bis zu 165 px neben der Spaltenkante, und `fitBounds`
   * bekam einen Zuschlag, den es gar nicht gab (Codex, 28.07.2026). Jetzt gibt
   * es nur den Zustand, und das CSS folgt ihm.
   *
   * Der Beobachter feuert schon beim Anhängen, der erste Wert ist also
   * unmittelbar geprüft.
   */
  useEffect(() => {
    const el = kasten.current
    if (!el) return
    const beobachter = new ResizeObserver(() =>
      setInspektorBreite((b) => spaltenBreite(b, el.clientWidth)),
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [])

  const griffTaste = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setInspektorBreite((b) => begrenzt(b + SPALTE_SCHRITT))
    else if (e.key === 'ArrowRight') setInspektorBreite((b) => begrenzt(b - SPALTE_SCHRITT))
    else if (e.key === 'Home') setInspektorBreite(begrenzt(SPALTE_STANDARD))
    else if (e.key === 'End') setInspektorBreite(begrenzt(SPALTE_MAX))
    else return
    e.preventDefault()
  }

  /**
   * `zieht` zurücksetzen, sobald es den Griff nicht mehr gibt.
   *
   * Verschwindet er mitten im Zug — zweiter Finger klappt die Spalte zu oder
   * startet das Grenzenzeichnen —, bekommt sein Handler das
   * `lostpointercapture` nicht mehr zuverlässig und `zieht` bliebe wahr. Eine
   * erste Fassung hat das nur in der Klasse maskiert; beim Wiederaufklappen kam
   * `user-select: none` samt Resize-Zeiger zurück und klebte am ganzen Kasten.
   * Der Zustand muss weg, nicht seine Anzeige. Von Codex gefunden, 28.07.2026.
   */
  useEffect(() => {
    if (!inspektorOffen || zeichner.editMode) setZieht(false)
  }, [inspektorOffen, zeichner.editMode])

  /**
   * Auswahl von der Karte — klappt die Spalte auf, wenn sie zu ist.
   *
   * Ohne das wählt der Klick etwas aus, das niemand sieht: der Marker bekommt
   * seinen Ring, die Details samt Foto stehen aber in der eingeklappten Leiste.
   * Für den Nutzer sieht es aus, als sei der Klick ins Leere gegangen. Die
   * Auswahl ist der ausdrückliche Wunsch, das Objekt zu sehen — dann muss die
   * Spalte weichen, nicht der Wunsch. (Moritz, 28.07.2026)
   *
   * Nur beim Auswählen, nicht beim Abwählen: „← Alle Objekte" soll die Spalte
   * nicht wieder aufreißen, wenn man sie gerade zugeklappt hat.
   */
  const aufKartenAuswahl = (id: string | null) => {
    setAuswahlId(id)
    if (id) setInspektorOffen(true)
  }

  // Nur abonnieren, nicht ableiten: der Zustand kommt aus dem Browser, auch
  // wenn ESC das Vollbild verlässt, ohne dass der Knopf beteiligt war.
  useEffect(() => {
    const wechsel = () => setVoll(document.fullscreenElement === kasten.current)
    document.addEventListener('fullscreenchange', wechsel)
    return () => document.removeEventListener('fullscreenchange', wechsel)
  }, [])

  const umschalten = () => {
    if (voll) {
      document.exitFullscreen().catch(() => {})
    } else {
      // Kann vom Browser abgelehnt werden (Berechtigung, iframe) — dann bleibt
      // es beim eingebetteten Kasten, ohne unbehandelte Rejection.
      kasten.current?.requestFullscreen().catch(() => {})
    }
  }

  const starten = () => {
    // Mehrringige Grenzen kann der Zeichen-Hook nicht — er nähme nur den ersten
    // Ring und würde die Enklaven beim Speichern verlieren. Lieber ablehnen.
    if (!nurEinRing(aktuelleGrenze)) {
      setFehler(
        'Diese Grenze enthält Enklaven (mehrere Ringe). Der Editor kann bisher nur ' +
          'einen Ring und würde die Löcher beim Speichern verlieren.',
      )
      return
    }
    setFehler(null)
    setLoeschFrage(false)
    // Auswahl fallen lassen: solange gezeichnet wird, ist der Inspektor weg und
    // eine unsichtbar weiterlaufende Auswahl käme danach überraschend zurück.
    setAuswahlId(null)
    zeichner.startEditing(aktuelleGrenze)
  }

  const abbrechen = () => {
    setFehler(null)
    zeichner.stopEditing()
    zeichner.reset()
  }

  /**
   * Speichern. Zwei Dinge bewusst anders als im mobilen Pfad:
   * - Vorher prüfen (Punktzahl, Selbstüberschneidung), statt PostGIS ein kaputtes
   *   Polygon zu geben.
   * - Bei Fehler **bleibt der Entwurf stehen** (Backlog E-R2). Im mobilen Pfad
   *   wird er verworfen und die gezeichnete Grenze ist weg.
   *
   * **`area_ha` wird nicht geschrieben und darf es nicht.** Die Spalte ist
   * `GENERATED ALWAYS AS (st_area(boundary::geography) / 10000)` — Postgres
   * lehnt jeden Schreibversuch mit
   * `column "area_ha" can only be updated to DEFAULT` ab. Die Fläche rechnet
   * damit die DB, geodätisch und immer passend zur Grenze; veralten kann sie
   * nicht. Der Client-Helfer `polygonAreaHectares` rechnet auf der Kugel und
   * liegt konstant 0,41 % darunter — er ist deshalb nur für die laufende Anzeige
   * im Entwurf gut, nie für einen Schreibwert.
   */
  const speichern = async () => {
    const problem = pruefeGrenze(zeichner.drawPoints)
    if (problem) {
      setFehler(problem)
      return
    }

    setLaeuft(true)
    setFehler(null)
    try {
      const ewkt = ewktAus(zeichner.drawPoints)
      await schreibe('Reviergrenze', () =>
        createClient()
          .from('districts')
          .update({ boundary: ewkt })
          .eq('id', revierId)
          .select('id, area_ha'),
      )
      // Erst den Zwischenspeicher setzen, dann zurücksetzen: ab hier ist die neue
      // Grenze die Wahrheit, auch wenn die Server-Komponente noch nachzieht.
      const ring = [...zeichner.drawPoints, zeichner.drawPoints[0]].map(
        (p) => [p.lat, p.lng] as [number, number],
      )
      setGespeichert([ring])
      zeichner.stopEditing()
      zeichner.reset()
      // Die Kennzahlen kommen aus der Server-Komponente — die muss nachrechnen,
      // insbesondere `area_ha`, das die DB selbst erzeugt.
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Löschen mit Rückfrage — im mobilen Pfad genügt ein Druck (Backlog E-R3).
   *
   * Nur `boundary`, nicht `area_ha`: die Spalte ist generiert und fällt von
   * selbst auf NULL, wenn die Grenze weg ist. Der mobile Pfad setzt hier
   * zusätzlich `area_ha: null` und **scheitert deshalb immer** — siehe Backlog.
   */
  const loeschen = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await schreibe('Reviergrenze', () =>
        createClient()
          .from('districts')
          .update({ boundary: null })
          .eq('id', revierId)
          .select('id, area_ha'),
      )
      setGespeichert(null)
      setLoeschFrage(false)
      zeichner.stopEditing()
      zeichner.reset()
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Löschen.')
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Ein Kartenobjekt speichern (Phase 3 Schritt 3a: Name, Typ, Notiz).
   *
   * Wirft bei Misserfolg — der Inspektor fängt es und lässt den Entwurf stehen.
   *
   * **`.eq('district_id', revierId)` ist nicht überflüssig — und seit dem
   * 29.07.2026 ist es die einzige Einschränkung, die hier noch trägt.** Käme je
   * eine fremde Objekt-ID in diesen Aufruf, hielte RLS sie nicht auf: sie deckt
   * *alle* Reviere des angemeldeten Nutzers, also auch Brockwinel und Söder.
   * Vorher stand die R3-Allowlist als zweites Netz dahinter; die ist mit der
   * Abnahme von Phase 3 weggefallen. Mit dieser Einschränkung trifft ein
   * verirrter Aufruf 0 Zeilen, und 0 Zeilen sind in `ausWriteErgebnis` ein
   * Fehler. **Wer sie entfernt, macht aus einem lauten Fehlschlag eine stille
   * Änderung am falschen Revier.**
   *
   * `position` bleibt unangetastet: Verschieben ist Schritt 3b und bekommt einen
   * eigenen Weg.
   */
  const objektSpeichern = async (id: string, entwurf: ObjektEntwurf) => {
    const spalten = alsSpalten(entwurf)
    await schreibe('Das Objekt', () =>
      createClient()
        .from('map_objects')
        .update(spalten)
        .eq('id', id)
        .eq('district_id', revierId)
        .select('id'),
    )
    merken(id, (p) => ({
      ...p,
      name: spalten.name,
      typ: spalten.type,
      beschreibung: spalten.description,
    }))
    router.refresh()
  }

  /**
   * Eine Zeile im Zwischenspeicher fortschreiben.
   *
   * Geht über den **aktuellen** Stand, nicht über die rohe `punkte`-Prop: sonst
   * verlöre ein Verschieben nach einem Umbenennen den neuen Namen wieder, weil
   * beide Writes denselben Eintrag beschreiben. Wer nichts findet, schreibt
   * nichts — der Fall kommt nur vor, wenn die Server-Daten zwischenzeitlich
   * eingetroffen sind, und dann hat der Server ohnehin recht.
   */
  function merken(id: string, fort: (p: Punkt) => Punkt) {
    const jetzt = aktuellePunkte.find((p) => p.id === id)
    if (!jetzt) return
    setGeschrieben((v) => ({ ...v, [id]: fort(jetzt) }))
  }

  /**
   * Die Position eines vorhandenen Objekts schreiben (Schritt 3b).
   *
   * **Nur `position`, sonst nichts.** Name, Typ und Notiz bleiben unangetastet,
   * obwohl sie im Formular daneben stehen. Grund ist E-R7: Objekt-Writes sind
   * last-write-wins, `map_objects` hat keine `updated_at`-Spalte, und jede
   * mitgeschriebene Spalte ist ein Fenster, in dem eine parallele Änderung aus
   * der Feld-App verloren geht. Wer nur verschiebt, schreibt nur die Position.
   *
   * `.eq('district_id', revierId)` aus demselben Grund wie bei `objektSpeichern`:
   * es ist seit dem Wegfall der R3-Allowlist die einzige Einschränkung, die eine
   * verirrte Objekt-ID vom falschen Revier fernhält — RLS tut es nicht, sie
   * deckt alle Reviere desselben Besitzers.
   */
  const positionSpeichern = async (id: string, ort: Ort) => {
    await schreibe('Die Position', () =>
      createClient()
        .from('map_objects')
        .update({ position: ewktPunkt(ort) })
        .eq('id', id)
        .eq('district_id', revierId)
        .select('id'),
    )
    merken(id, (p) => ({ ...p, lat: ort.lat, lng: ort.lng }))
    router.refresh()
  }

  /**
   * Ein neues Objekt anlegen (Schritt 3b).
   *
   * Vier Spalten, die kein Formular liefert und die deshalb hier stehen:
   * `position` (NOT NULL, kommt aus dem Kartenklick), `district_id` (sonst wäre
   * das Objekt revierlos und in der Übersicht unsichtbar, weil sie auf
   * `district_id` filtert) und `created_by`.
   *
   * `created_by` ist nicht Kosmetik: von den vier RLS-Policies auf `map_objects`
   * trägt `map_objects_creator_manage` genau diese Bedingung. Wer sie leer
   * lässt, hängt allein an `map_objects_district_owner` — und verliert jeden
   * Zugriff auf das eigene Objekt, sobald das Revier den Besitzer wechselt.
   *
   * `.select()` gibt die neue `id` zurück, und die braucht der Zwischenspeicher:
   * ohne sie wäre das Objekt bis zum Eintreffen der Server-Daten unsichtbar.
   */
  const objektAnlegen = async (entwurf: ObjektEntwurf, ort: Ort) => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht angemeldet — bitte die Seite neu laden.')

    const spalten = alsSpalten(entwurf)
    const zeile = await schreibe('Das neue Objekt', () =>
      supabase
        .from('map_objects')
        .insert({
          ...spalten,
          position: ewktPunkt(ort),
          district_id: revierId,
          created_by: user.id,
        })
        .select('id'),
    )

    const neu: Punkt = {
      id: zeile.id,
      name: spalten.name,
      typ: spalten.type,
      beschreibung: spalten.description,
      lat: ort.lat,
      lng: ort.lng,
      fotoUrl: null,
    }
    setGeschrieben((v) => ({ ...v, [neu.id]: neu }))
    // Direkt auswählen: wer ein Objekt anlegt, will sehen, dass es da ist —
    // und steht damit gleich an der Stelle, an der Umbenennen und Verschieben
    // weitergehen.
    setAuswahlId(neu.id)
    router.refresh()
  }

  /**
   * Ein Kartenobjekt löschen (Schritt 3c).
   *
   * Wirft bei Misserfolg — der Inspektor fängt es und lässt die Rückfrage stehen.
   *
   * **Papierkorb statt hartem DELETE** (Migrationen 072–074). Das Objekt bleibt
   * in der Datenbank, ist wiederherstellbar, und seine Kontrollen und Fotos
   * überleben — ein hartes DELETE hätte sie per CASCADE mitgenommen.
   *
   * **Warum nicht durch `schreibe()`.** Die RPC hat `returns void` und liefert
   * damit `{ data: null, error: null }` — genau das Muster, das
   * `ausWriteErgebnis` als Fehlschlag deutet. Sie würde bei jedem ERFOLG
   * werfen. `schreibe()` ist für Tabellen-Writes mit `.select()` gebaut; hier
   * übernimmt die Funktion selbst, was `schreibe()` sonst leistet: sie wirft
   * bei 0 betroffenen Zeilen, statt still Erfolg zu melden. Der Fehler wird
   * unten nur in dieselbe Form gebracht, damit der Inspektor ihn wie bisher
   * fängt.
   *
   * **Die Revier-Schranke ist geblieben, sie steht nur woanders.** Vorher war
   * es `.eq('district_id', revierId)`, jetzt `p_district_id` — und seit 074 ist
   * der Parameter Pflicht, nicht optional. Der Grund ist unverändert und wiegt
   * am schwersten: seit dem Wegfall der R3-Allowlist (29.07.2026) ist er die
   * einzige Einschränkung, die eine verirrte Objekt-ID vom falschen Revier
   * fernhält — RLS tut es nicht, sie deckt alle Reviere desselben Besitzers und
   * damit auch Brockwinel mit den echten Pilotdaten. Der Papierkorb macht den
   * Fall milder, nicht harmlos: die Zeile wäre wiederherstellbar, sie
   * verschwände aber still, und niemand sucht in einem Papierkorb, von dem er
   * nichts weiß.
   *
   * Die Auswahl fällt: das gewählte Objekt gibt es nicht mehr, und der Inspektor
   * zeigte sonst eine Detailseite zu einer Zeile, die weg ist.
   */
  const objektLoeschen = async (id: string) => {
    try {
      const { error } = await createClient().rpc('kartenobjekt_loeschen', {
        p_id: id,
        p_district_id: revierId,
      })
      if (error) {
        throw new Error(`Das Objekt konnte nicht gelöscht werden: ${error.message}`)
      }
    } catch (e) {
      // **Auch der Fehlschlag zieht nach.** Der wahrscheinlichste Grund für 0
      // betroffene Zeilen ist, dass die Feld-App dasselbe Objekt schon gelöscht
      // hat — dann steht hier eine Zeile, die es nicht mehr gibt, und ohne
      // Refresh bliebe sie stehen: die Rückfrage klebte an einer Leiche, und
      // jeder weitere Versuch scheiterte mit derselben Meldung. Der Refresh
      // holt die Wahrheit und räumt die Zeile ab, ganz gleich, welcher der drei
      // Gründe es war. Von Codex gefunden, 29.07.2026.
      //
      // Der Fehler fliegt trotzdem weiter: der Nutzer soll sehen, dass sein
      // Löschen nicht das war, was das Objekt entfernt hat.
      router.refresh()
      throw e
    }
    setGeschrieben((v) => ({ ...v, [id]: null }))
    setAuswahlId(null)
    // Fokus mitführen, wie „← Alle Objekte" es tut: die Detailansicht hängt
    // sich mit dem gelöschten Objekt aus, und ohne das fängt der nächste
    // Tabulator wieder am Seitenanfang an.
    sucheRef.current?.focus()
    router.refresh()
  }

  /**
   * Woher das Objekt kommt, das gerade verschoben wird. Beim Anlegen `null` —
   * dann gibt es keinen Ursprung, nur ein Ziel.
   */
  const setzUrsprung =
    setzen?.art === 'position'
      ? (aktuellePunkte.find((p) => p.id === setzen.id) ?? null)
      : null

  /**
   * Ein Kartenklick im Setzmodus. Jeder weitere überschreibt den vorigen —
   * korrigieren ist derselbe Weg wie setzen, nicht ein zweiter.
   */
  const aufOrt = (ort: Ort) => setSetzen((s) => (s ? { ...s, kandidat: ort } : s))

  const positionStarten = (id: string) => {
    setFehler(null)
    setLoeschFrage(false)
    setSetzen({ art: 'position', id, kandidat: null })
  }

  const anlegenStarten = () => {
    setFehler(null)
    setLoeschFrage(false)
    // Auswahl fallen lassen: die Spalte zeigt jetzt das Anlege-Formular, und
    // eine unsichtbar weiterlaufende Auswahl käme danach überraschend zurück.
    // Dieselbe Überlegung wie beim Start des Grenzenzeichnens.
    setAuswahlId(null)
    // Spalte aufklappen — sonst eine Sackgasse: das Formular steht in ihr, und
    // der Klapp-Winkel ist im Setzmodus gesperrt. Wer bei eingeklappter Spalte
    // „Objekt anlegen" drückte, käme ohne Reload nicht mehr an das Formular.
    // Dieselbe Regel wie bei einer Auswahl von der Karte.
    setInspektorOffen(true)
    setSetzen({ art: 'neu', kandidat: null })
  }

  /** Abbrechen verwirft nur den Positionsentwurf; das Objekt bleibt, wie es war. */
  const setzAbbrechen = () => {
    setFehler(null)
    setSetzen(null)
  }

  /**
   * Beide Setz-Abschlüsse werfen bei Misserfolg und lassen den Modus dann
   * **stehen** — dieselbe Lehre wie bei der Grenze (Backlog E-R2): ein
   * gescheiterter Write darf den Entwurf nicht mitnehmen, sonst ist die gerade
   * gesetzte Position weg und niemand weiß, warum.
   */
  const positionAbschliessen = async () => {
    if (setzen?.art !== 'position' || !setzen.kandidat) return

    // **Erst prüfen, dann vergleichen.** Die Reihenfolge ist nicht beliebig:
    // `pruefeOrt` wickelt den Längengrad zurück, und ein ungewickelter Kandidat
    // (370,2 gegen 10,2) sähe vor dem Wickeln nach einer Verschiebung aus, die
    // es nach dem Wickeln nicht mehr ist. Andersherum entstünde ein Write, der
    // denselben Wert schreibt.
    const geprueft = pruefeOrt(setzen.kandidat)
    if ('fehler' in geprueft) throw new Error(geprueft.fehler)

    // Nichts verschoben heißt nichts schreiben — dieselbe Regel wie bei den
    // Textfeldern (`unveraendert`). Wer „Position ändern" drückt und dann auf
    // das Objekt selbst klickt, hat es nicht verschoben, und ein Write darauf
    // wäre ein unnötiges last-write-wins-Fenster (E-R7).
    if (setzUrsprung && ortUnveraendert(setzUrsprung, geprueft.ort)) {
      setSetzen(null)
      return
    }
    // `laeuft` friert den Kartenklick ein, siehe Kommentar an `aufOrt` unten.
    // Der Fehler fliegt weiter — der Inspektor fängt ihn und zeigt ihn an; der
    // Modus bleibt dann stehen.
    setLaeuft(true)
    try {
      await positionSpeichern(setzen.id, geprueft.ort)
      setSetzen(null)
    } finally {
      setLaeuft(false)
    }
  }

  const anlegenAbschliessen = async (entwurf: ObjektEntwurf) => {
    if (setzen?.art !== 'neu' || !setzen.kandidat) return
    const geprueft = pruefeOrt(setzen.kandidat)
    if ('fehler' in geprueft) throw new Error(geprueft.fehler)
    setLaeuft(true)
    try {
      await objektAnlegen(entwurf, geprueft.ort)
      setSetzen(null)
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Steht der Setzmodus auf einem Objekt, das es nicht mehr gibt? Dann raus.
   *
   * Sonst eine Sackgasse: der Inspektor zeigt ohne Auswahl die Liste, aber
   * `setzen` sperrt weiter das Einklappen und alle anderen Modi — „Position
   * speichern" UND „Abbrechen" wären beide verschwunden, und es bliebe nur
   * Revierwechsel oder Reload. Erreichbar, weil die Feld-App Objekte löschen
   * kann, während hier eines verschoben wird. Von Codex gefunden, 28.07.2026.
   *
   * Die Abhängigkeit ist bewusst der abgeleitete Wahrheitswert und nicht
   * `aktuellePunkte`: das Array ist bei jedem Rendern neu, der Effekt lief
   * sonst jedes Mal.
   */
  const setzZielFehlt = setzen?.art === 'position' && !setzUrsprung
  useEffect(() => {
    if (setzZielFehlt) setSetzen(null)
  }, [setzZielFehlt])

  return (
    <div
      ref={kasten}
      className={`zentrale-karte-kasten${kino ? ' kino' : ''}${zieht ? ' zieht' : ''}`}
      style={{ '--inspektor-breite': `${inspektorBreite}px` } as React.CSSProperties}
    >
      {/* Die Leiste hängt am KASTEN, nicht an der Bühne.
          Damit steht ihr rechtes Ende immer am rechten Rand des Ganzen — also
          Suchfeld und Klapp-Winkel genau über der Objektspalte, und die Legende
          direkt darunter (Moritz, 28.07.2026). Hing sie an der Bühne, rutschte
          sie beim Ein- und Ausklappen um die Spaltenbreite hin und her, und man
          tippte links, während rechts die Treffer erschienen.
          Die Meldungen bleiben in der Bühne: die sitzen unten und gehören zur
          Karte, nicht zur Spalte. */}
      <div className="zentrale-karte-knoepfe">
        {!zeichner.editMode && (
          <button type="button" onClick={starten} disabled={beschaeftigt}>
            {aktuelleGrenze ? 'Grenze bearbeiten' : 'Grenze zeichnen'}
          </button>
        )}

        {zeichner.editMode && (
          <>
            <button type="button" onClick={speichern} disabled={laeuft}>
              {laeuft ? 'Speichert …' : 'Fertig'}
            </button>
            <button type="button" onClick={zeichner.undo} disabled={laeuft || !zeichner.drawPoints.length}>
              Punkt zurück
            </button>
            <button type="button" onClick={abbrechen} disabled={laeuft}>
              Abbrechen
            </button>
          </>
        )}

        {/* Anlegen steht bei den Grenzen-Knöpfen, nicht in der Objektspalte: es
            ist dieselbe Sorte Handlung („in diesem Revier etwas neu
            einrichten"), und es ist auch bei eingeklappter Spalte erreichbar —
            `anlegenStarten` klappt sie dann auf.
            Kein zweiter Abbrechen-Knopf hier: der steht im Fuß der Spalte, und
            die ist im Setzmodus garantiert offen. */}
        {!zeichner.editMode && (
          <button type="button" onClick={anlegenStarten} disabled={beschaeftigt}>
            Objekt anlegen
          </button>
        )}

        {!zeichner.editMode && aktuelleGrenze && !loeschFrage && (
          <button type="button" onClick={() => setLoeschFrage(true)} disabled={beschaeftigt}>
            Grenze löschen
          </button>
        )}
        {!zeichner.editMode && aktuelleGrenze && loeschFrage && (
          <>
            <button type="button" onClick={loeschen} disabled={beschaeftigt}>
              {laeuft ? 'Löscht …' : 'Wirklich löschen'}
            </button>
            <button type="button" onClick={() => setLoeschFrage(false)} disabled={laeuft}>
              Behalten
            </button>
          </>
        )}

        {/* Im Vollbild sinnlos — die Zwischengröße ist dort keine Größe mehr. */}
        {!voll && (
          <button type="button" onClick={() => setKino((k) => !k)}>
            {kino ? 'Kleiner' : 'Kinomodus'}
          </button>
        )}
        <button type="button" onClick={umschalten}>
          {voll ? 'Vollbild beenden' : 'Vollbild'}
        </button>

        {/* Ganz rechts, und damit senkrecht über der Objektspalte: erst das
            Suchfeld, direkt darunter die Legende in der Spalte. Beim Zeichnen
            weg — dann gibt es keine Liste zu filtern, und die Leiste braucht
            den Platz für Fertig · Punkt zurück · Abbrechen.
            Im Setzmodus aus demselben Grund: die Spalte zeigt dann ein Formular,
            keine Liste. Ein Feld, in das man tippen kann und in dem nichts
            passiert, ist schlechter als keins. */}
        {!zeichner.editMode && !setzen && (
          <div className="zentrale-karte-suchfeld">
            <input
              ref={sucheRef}
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Objekt suchen …"
              aria-label="Kartenobjekte durchsuchen"
            />

            {/* Nur bei eingeklappter Spalte: sonst stünde dasselbe zweimal da. */}
            {!inspektorOffen && suchbegriff && (
              <div className="zentrale-karte-treffer">
                {treffer.length === 0 ? (
                  <p className="leer">Nichts gefunden.</p>
                ) : (
                  <>
                    <ul>
                      {treffer.slice(0, TREFFER_MAX).map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => aufKartenAuswahl(p.id)}>
                            <span className="nam">{p.name}</span>
                            <span className="typ">{typLabel(p.typ)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {treffer.length > TREFFER_MAX && (
                      <p className="leer">
                        … und {treffer.length - TREFFER_MAX} weitere. Genauer tippen oder
                        die Spalte aufklappen.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Der Klapp-Winkel gehört hierher, nicht in die Spalte: hier bleibt er
            stehen, wenn die Spalte weg ist. Damit braucht es auch keine
            34-Pixel-Restleiste mehr — eingeklappt ist die Spalte jetzt ganz
            weg und die Karte bekommt den vollen Platz. */}
        {!zeichner.editMode && (
          <button
            type="button"
            className="klapp"
            onClick={() => setInspektorOffen((o) => !o)}
            // Auch im Setzmodus zu: dort steht der Weg zum Abschluss in der
            // Spalte („Position speichern", „Objekt anlegen"), und eingeklappt
            // wäre er unsichtbar — der Nutzer hielte den Entwurf für verworfen.
            // Derselbe Grund wie bei einem offenen Objektentwurf.
            disabled={objektBearbeitung || setzen !== null}
            aria-expanded={inspektorOffen}
            aria-controls="zentrale-inspektor"
            aria-label={inspektorOffen ? 'Objektspalte einklappen' : 'Objektspalte ausklappen'}
            title={inspektorOffen ? 'Objektspalte einklappen' : 'Objektspalte ausklappen'}
          >
            {inspektorOffen ? '›' : '‹'}
          </button>
        )}
      </div>

      {/* Die Bühne trägt Karte und Meldungen. Die Meldungen sitzen unten in ihr
          und sollen mit der Karte wandern, nicht mit der Spalte. */}
      <div className="zentrale-karte-buehne">
      {zeichner.editMode && (
        <p className="zentrale-karte-hinweis">
          In die Karte klicken setzt Punkte · Punkte ziehen verschiebt sie · kleine
          Punkte dazwischen fügen ein · Klick auf einen Punkt löscht ihn (ab 4)
          {/* „≈", weil der Client-Helfer auf der Kugel rechnet und rund 0,4 %
              unter dem geodätischen Wert liegt, den die generierte Spalte
              `area_ha` nach dem Speichern anzeigt. Ohne das Zeichen sähe der
              kleine Sprung beim Speichern wie ein Fehler aus. Genauer geht am
              Entwurf nicht — die DB kennt ein ungespeichertes Polygon nicht. */}
          {zeichner.drawPoints.length >= 3 &&
            ` · ≈ ${polygonAreaHectares(zeichner.drawPoints).toFixed(1)} ha`}
        </p>
      )}

      {/* Dieselbe Zeile wie beim Zeichnen, weil es dieselbe Aussage ist: „die
          Karte ist jetzt Werkzeug". Sie sagt zusätzlich, was der Klick bewirkt
          hat — ohne Rückmeldung weiß man nach dem Klick nicht, ob er angekommen
          ist, und der bronzene Punkt allein ist bei 196 Markern leicht zu
          übersehen. */}
      {setzen && (
        <p className="zentrale-karte-hinweis">
          {setzen.art === 'neu'
            ? 'In die Karte klicken setzt die Position des neuen Objekts'
            : 'In die Karte klicken setzt die neue Position · der alte Ort bleibt blass stehen'}
          {setzen.kandidat && ' · erneut klicken verschiebt'}
          {setzen.kandidat &&
            ` · ${setzen.kandidat.lat.toFixed(5)}, ${setzen.kandidat.lng.toFixed(5)}`}
          {/* Die Strecke nur beim Verschieben: beim Anlegen gibt es nichts, wovon
              aus gemessen werden könnte. Sie ist die eine Zahl, an der man
              erkennt, ob man den richtigen Punkt getroffen hat — „3 m" ist eine
              Korrektur, „800 m" ein Fehlgriff. */}
          {setzen.kandidat &&
            setzUrsprung &&
            ` · ${Math.round(
              distanceInMeters(
                setzUrsprung.lat,
                setzUrsprung.lng,
                setzen.kandidat.lat,
                setzen.kandidat.lng,
              ),
            )} m verschoben`}
        </p>
      )}

      {fehler && (
        <p className="zentrale-karte-fehler" role="alert">
          {fehler}
        </p>
      )}

      <Karte
        grenze={aktuelleGrenze}
        punkte={aktuellePunkte}
        auswahlId={auswahlId}
        // Während einer Objektbearbeitung nicht wählbar — sonst verwirft der
        // Klick den Entwurf, den er gar nicht sehen kann. Im Setzmodus sperrt
        // die Karte selbst (`waehlbar`), weil dort der Klick gebraucht wird.
        aufAuswahl={objektBearbeitung ? undefined : aufKartenAuswahl}
        setzen={
          setzen
            ? {
                kandidat: setzen.kandidat,
                ursprung: setzUrsprung
                  ? { lat: setzUrsprung.lat, lng: setzUrsprung.lng }
                  : null,
                // Während des Writes eingefroren, nicht nur die Knöpfe gesperrt.
                // Sonst: Position A setzen, „Position speichern", bei langsamer
                // Verbindung noch B anklicken — sichtbar ist dann B, geschrieben
                // wird A, und beim Schließen des Modus verschwindet B
                // kommentarlos. Der Nutzer hat zuletzt B gesehen und glaubt, B
                // sei gespeichert. Von Codex gefunden, 28.07.2026 — dieselbe
                // Falle wie beim Grenzenzeichnen, wo `nichts` schon dafür da ist.
                aufOrt: laeuft ? nichts : aufOrt,
              }
            : undefined
        }
        // Was die Spalte gerade überdeckt. Beim Zeichnen ist sie weg, dann null.
        randRechts={inspektorOffen && !zeichner.editMode ? inspektorBreite : 0}
        zeichnen={
          zeichner.editMode
            ? {
                punkte: zeichner.drawPoints,
                // Während eines laufenden Writes bleibt der Entwurf sichtbar, ist
                // aber eingefroren. `laeuft` sperrte vorher nur die Knöpfe: wer bei
                // langsamer Verbindung nach „Fertig" noch einen Punkt zog, sah
                // seine Änderung anschließend kommentarlos verschwinden, weil das
                // EWKT den Stand von vorher trug und danach alles zurückgesetzt
                // wurde. Von Codex gefunden, 27.07.2026.
                aufKlick: laeuft ? nichts : zeichner.addPoint,
                aufZug: laeuft ? nichts : zeichner.dragVertex,
                aufLoeschen: laeuft ? nichts : zeichner.deleteVertex,
                aufEinfuegen: laeuft ? nichts : zeichner.insertMidpoint,
              }
            : undefined
        }
      />
      </div>

      {/* Beim Zeichnen weg: die Karte ist dann Werkzeug, kein Auswahlmittel, und
          zwei gleichzeitig offene Bearbeitungen wären zwei Wahrheiten. */}
      {!zeichner.editMode && (
        <>
          {/* Eigener Flex-Streifen zwischen Bühne und Spalte statt eines
              Overlays: beim Ziehen ändert sich nur eine Zahl, das Layout macht
              den Rest. Kein Griff, wenn nichts zu ziehen da ist. */}
          {inspektorOffen && (
            <div
              className="zentrale-inspektor-griff"
              role="separator"
              aria-orientation="vertical"
              aria-label="Breite der Objektspalte"
              // Bewusst ohne aria-valuenow: der `max-width`-Riegel im CSS kann
              // die sichtbare Breite unter den gespeicherten Wert drücken, ohne
              // dass ein Ereignis feuert (Vollbild verlassen, Fenster kleiner).
              // Eine angesagte Zahl wäre dann falsch, und eine falsche Zahl ist
              // schlechter als keine. Von Codex gefunden, 28.07.2026.
              tabIndex={0}
              onKeyDown={griffTaste}
              onPointerDown={(e) => {
                // Pointer-Capture, damit ein schneller Zug nicht auf der Karte
                // landet und dort als Auswahl oder Grenzpunkt endet.
                e.currentTarget.setPointerCapture(e.pointerId)
                setZieht(true)
              }}
              onPointerMove={(e) => {
                // Das Capture selbst ist die Wahrheit, nicht `zieht`: ein frisch
                // eingeblendeter Griff hat keins, und ein bloßes Darüberfahren
                // ändert deshalb nichts — auch dann nicht, wenn der Zustand von
                // einem abgebrochenen Zug noch true wäre.
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
                const rand = kasten.current?.getBoundingClientRect().right
                if (rand !== undefined) setInspektorBreite(begrenzt(rand - e.clientX))
              }}
              // Deckt Loslassen und Abbruch in einem: der Browser gibt das
              // Capture bei beidem von selbst zurück.
              onLostPointerCapture={() => setZieht(false)}
            />
          )}

          <ObjektInspektor
            punkte={aktuellePunkte}
            auswahlId={auswahlId}
            aufAuswahl={setAuswahlId}
            aufSpeichern={objektSpeichern}
            aufModus={setObjektBearbeitung}
            suche={suche}
            aufSuchfeldFokus={() => sucheRef.current?.focus()}
            ausgeklappt={inspektorOffen}
            setzen={setzen}
            aufPositionStarten={positionStarten}
            aufPositionSpeichern={positionAbschliessen}
            aufAnlegen={anlegenAbschliessen}
            aufSetzAbbrechen={setzAbbrechen}
            aufLoeschen={objektLoeschen}
          />
        </>
      )}
    </div>
  )
}
