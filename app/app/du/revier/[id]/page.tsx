import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RevierContent from './revier-content'
import type { PruefZeile } from '@/lib/revier/wartung'
import { kontoNamenVollstaendig, type KontoName } from '@/lib/konto-namen'

export default async function RevierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Revier laden
  const { data: district } = await supabase
    .from('districts')
    .select('id, name, owner_id, boundary, area_ha, bundesland')
    .eq('id', id)
    .single()

  if (!district || district.owner_id !== user.id) redirect('/app/du')

  // Bestehende Revier-Objekte laden
  const { data: objects } = await supabase
    .from('map_objects')
    .select('id, district_id, type, name, position, description, photo_url, created_by, created_at')
    .eq('district_id', id)

  /**
   * Der Standzustand je Kartenobjekt (Konzept Standzustand §4.4).
   *
   * **Die View aus Migration 117, nicht die Tabelle.** `distinct on
   * (map_object_id)` gibt je Objekt genau die jüngste Prüfzeile — dieselbe
   * Grundlage, aus der Portal und Feld-App ihre Aussage ziehen. Das
   * Client-Dedup, das sie ersetzt, wurde ab 2000 Historienzeilen still falsch:
   * ein Stand mit alter Sperre erschien dort als nie geprüft.
   *
   * **Zusammen mit den Namen in EINER Welle**, weil beide für dieselbe Zeile
   * gebraucht werden — „Name · Zustand · wann · von wem" (§3).
   *
   * **Ein Ladefehler wird hier NICHT geworfen.** Anders als im Portal
   * (`laden.ts`: „lieber nichts anzeigen als eine falsche Zahl") ist dies der
   * Revier-Editor im Feld: die Karte ist der Zweck, und sie muss aufgehen, auch
   * wenn der Prüfstand gerade nicht kommt. Was stattdessen geschieht, steht in
   * `revier-content.tsx` an `pruefFehler` — der Zustand liest sich dann als
   * „nicht abrufbar", nie als „noch nie geprüft". Derselbe Schnitt, den die
   * Feld-App mit `CheckState.kind === 'error'` macht, und aus demselben Grund:
   * **ein Fehler, der wie ein gültiger Zustand aussieht, ist schlimmer als ein
   * sichtbarer Fehler** — ein Stand mit aktiver Sperre stünde sonst als
   * ungeprüft da.
   */
  const [pruefErgebnis, namenErgebnis] = await Promise.all([
    supabase
      .from('map_object_letzte_pruefung')
      .select('map_object_id, status, checked_at, note, checked_by')
      .eq('district_id', id),
    // konto_namen() statt profiles — s. `src/lib/konto-namen.ts`. Der Prüfer
    // kann ein Schein-Inhaber sein und der Leser der Revierbesitzer, ohne dass
    // beide je eine Jagd geteilt haben; über `profiles` wäre der Name nach
    // Migration 116 still verschwunden.
    supabase.rpc('konto_namen'),
  ])

  const pruefZeilen = (pruefErgebnis.data ?? []) as PruefZeile[]

  /**
   * Abgeschnitten? Dann gilt der Prüfstand als NICHT abrufbar.
   *
   * **Ein Befund der Fremdprüfung** (25.08.2026, A7 `[medium]`): die Abfrage
   * hat weder Pagination noch Zähler. Erreicht ein Revier den
   * PostgREST-Deckel, bleibt `error` trotzdem `null` — die fehlenden Zeilen
   * kämen als „noch nie geprüft" durch, **eine Sperre also als Schweigen.**
   * Das ist genau die Verwechslung, gegen die `pruefFehler` gebaut ist; sie
   * kam nur durch eine Tür herein, die niemand als Tür gelesen hatte.
   *
   * **Der Deckel wird in `pruefFehler` gefaltet, statt eine dritte Prop zu
   * bekommen.** Für den Leser des Sheets ist die Auskunft dieselbe: wir wissen
   * es nicht. Ein eigener Zustand „teilweise geladen" wäre eine Unterscheidung
   * ohne Handlungsfolge.
   *
   * **Weit außer Reichweite** (Söder: 196 Objekte insgesamt), und trotzdem
   * eine Zeile wert — er kostet nichts und schlägt an, bevor jemand hersieht.
   *
   * ⚠ **Die Objekt-Abfrage darüber hat denselben Deckel und KEINE Prüfung.**
   * Vorbestehend, nicht in diesem Diff entstanden, und die Folge ist eine
   * andere (fehlende Karten-Objekte statt falscher Zustände). Steht als
   * CP-72 im Backlog.
   */
  const pruefungenAbgeschnitten = pruefZeilen.length >= 1000

  /**
   * Die Namen der Prüfer, als einfaches Objekt.
   *
   * **Eine `Map` ginge nicht:** die Prop überquert die Grenze vom Server- zum
   * Client-Bauteil und muss serialisierbar sein.
   *
   * **Beim Kappen fallen ALLE Namen weg, statt einzelne still zu verlieren.**
   * `konto_namen()` ist ungepagt (s. `kontoNamenVollstaendig`); nach einem
   * Schnitt bei 1000 Zeilen stünde bei manchen Prüfungen „ohne Namen" und bei
   * anderen nicht, ohne dass irgendwer den Unterschied deuten könnte. Alles
   * oder nichts ist die ehrlichere Auskunft — und „ohne Namen" heißt bereits
   * dokumentiert „Konto nicht auflösbar", nicht „niemand".
   */
  const kontoZeilen = (namenErgebnis.data ?? []) as KontoName[]
  const namenVollstaendig = kontoNamenVollstaendig(kontoZeilen)
  if (!namenVollstaendig) {
    console.warn(
      `konto_namen(): ${kontoZeilen.length} Zeilen — PostgREST-Deckel erreicht. ` +
        'Prüfernamen werden ausgelassen (Backlog CP-71).',
    )
  }

  /**
   * Nur die Namen, die auf dieser Seite wirklich vorkommen.
   *
   * **Der beste Fund dieser Prüfkette, und er kam aus dem OFFENEN Fokuspunkt**
   * (Fremdprüfung 25.08.2026, A9 `[medium]` — dem Auftrag „was hat hier bisher
   * niemand angesehen?"). Die erste Fassung kopierte die vollständige Antwort
   * von `konto_namen()` in die Prop und serialisierte sie in den RSC-Payload:
   * jedes Konto der Installation, auslesbar im Quelltext der Seite, für ein
   * Revier mit vier Prüfern.
   *
   * **Es ist kein Rechteloch** — `konto_namen()` ist ausdrücklich für jeden
   * Angemeldeten da und gibt nur `id` und `display_name`; wer die Seite öffnet,
   * dürfte die RPC selbst rufen. **Es ist ein Datenbedarf, der nicht besteht**,
   * und der Filter kostet zwei Zeilen. Ein Payload, der mehr trägt als die
   * Seite braucht, wächst mit der Nutzerzahl und nicht mit dem Revier.
   *
   * Das Portal hat den Fehler nie gehabt: dort löst `pruefungFuer()` den Namen
   * serverseitig je Objekt auf, die Karte bekommt nie eine Namensliste.
   */
  const gebraucht = new Set(pruefZeilen.map((z) => z.checked_by).filter((id): id is string => id !== null))
  /**
   * **Der eigene Name gehört immer dazu** (Schlusslesung 25.08.2026, T1(f)).
   * Ohne ihn steht nach der ERSTEN eigenen Prüfung einer Sitzung „Geprüft
   * 〈Zeit〉" ohne „von 〈Name〉" — die Kennung kam ja nicht in den Zeilen vor,
   * aus denen diese Liste gebaut wurde. Semantisch gedeckt („null heißt
   * unbekannt"), aber sichtbar falsch: den eigenen Namen kennt man.
   * Kein Datenbedarf, der nicht besteht — es ist das eigene Konto.
   */
  gebraucht.add(user.id)
  const prueferNamen: Record<string, string> = {}
  if (namenVollstaendig) {
    for (const k of kontoZeilen) {
      if (gebraucht.has(k.id)) prueferNamen[k.id] = k.display_name
    }
  }

  /**
   * Der Zeitpunkt, gegen den Saison und Zukunftsgrenze gerechnet werden —
   * **einmal auf dem Server abgelesen und hinuntergereicht.**
   *
   * `new Date()` im Client-Bauteil wäre die naheliegende Fassung und wäre
   * falsch: Server und Browser rechneten dann verschiedene Werte, und der
   * Zusammenfassungssatz im Kopf käme beim Hydrieren anders heraus als beim
   * Rendern. Eine Zahl, die beim Laden der Seite kurz springt, ist genau die
   * Art Auskunft, der man später nicht glaubt.
   *
   * **Er altert und darf das**, mit einer Ausnahme: eine Prüfung, die während
   * der Sitzung geschrieben wird, ist JÜNGER als dieser Zeitpunkt und fiele
   * unter die Zukunftsgrenze. Wie `revier-content.tsx` das auflöst, steht dort
   * an `setJetzt`.
   */
  const jetztIso = new Date().toISOString()

  return (
    <RevierContent
      district={district}
      objects={objects || []}
      userId={user.id}
      pruefZeilen={pruefZeilen}
      pruefFehler={pruefErgebnis.error !== null || pruefungenAbgeschnitten}
      prueferNamen={prueferNamen}
      jetztIso={jetztIso}
    />
  )
}
