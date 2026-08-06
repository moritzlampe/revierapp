import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { istStand, typLabel } from '../objekte'
import Ausstellen, { Einloesen } from './formular'
import type { StandWahl, ScheinZeile } from './formular'
import { heuteUtc, type Zahlung } from './scheine'
import './jagderlaubnisse.css'
import { geladen } from '../laden'

/**
 * Jagderlaubnisse — Begehungsscheine ausstellen und einlösen.
 *
 * **Warum diese Seite beides trägt.** Ausstellen ist Sache des
 * Revierbesitzers, Einlösen die des Nehmers — zwei Rollen, aber ein Begriff.
 * Eine zweite Route dafür hätte einen sechsten Eintrag in der Seitenleiste
 * gebraucht, und die fünf Bereiche sind in §1.1 des Zentrale-Konzepts gelockt.
 * Die Einlöse-Karte steht deshalb auch dann da, wenn dem Konto gar kein Revier
 * gehört: genau dieser Mensch ist der Nehmer.
 *
 * **Was RLS hier tut (Migration 079, 31.07.2026):** Ausstellen, Ändern und
 * Löschen darf nur der Revierbesitzer. Die Revier-Auswahl der Seitenleiste
 * zeigt ohnehin nur eigene Reviere, die Policy ist also nicht die Anzeige-
 * grenze, sondern das Netz darunter.
 */

type Revier = { id: string; name: string; bundesland: string | null }

/** Fehler nicht verschlucken — gleiche Haltung wie `geladen()` in ../page.tsx:
 *  eine leere Liste ist von einem RLS-Bruch nicht zu unterscheiden. */
export default async function JagderlaubnissePage({
  searchParams,
}: {
  searchParams: Promise<{ revier?: string }>
}) {
  const { revier: gewuenscht } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login: der Proxy ist der Wächter für /zentrale. Bounct
  // die Seite zusätzlich, kann bei einer Abweichung eine Schleife entstehen.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagderlaubnisse</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Seite braucht eine Anmeldung. <a href="/login?next=/zentrale/jagderlaubnisse">Zum Login</a>.
          </p>
        </div>
      </div>
    )
  }

  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name, bundesland')
      .eq('owner_id', user.id)
      .eq('hidden', false)
      .order('name'),
    'Reviere'
  )

  // Ohne eigenes Revier ist die Seite nicht leer, sondern halb: ausstellen geht
  // nicht, einlösen sehr wohl. Das ist der Normalfall für einen Gastjäger.
  if (reviere.length === 0) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagderlaubnisse</h1>
        <p className="zentrale-sub">Kein eigenes Revier</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Begehungsscheine ausstellen kann nur, wem das Revier gehört. Einen
            Schein annehmen kannst du hier trotzdem.
          </p>
        </div>
        <Einloesen />
      </div>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2) — dieselbe kanonische Adresse wie
  // auf der Übersicht, damit der Wechsler der Seitenleiste weiterträgt.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/jagderlaubnisse?revier=${reviere[0].id}`)

  const scheine = geladen<ScheinZeile[]>(
    await supabase
      .from('hunting_licenses')
      .select(
        // `entgelt_faellig` steht hier bewusst nicht mehr: seit 105 abgelöst,
        // und was geladen wird, zeigt irgendwann jemand an.
        'id, holder_name, holder_email, holder_id, valid_from, valid_until, status, ' +
          'auflagen, zone_ids, stand_ids, invite_code, entgeltlich, entgelt_betrag, ' +
          'entgelt_intervall, entgelt_erste_zahlung'
      )
      .eq('district_id', revier.id)
      .order('valid_until', { ascending: false }),
    'Begehungsscheine'
  )

  // Das Zahlungsjournal zu allen Scheinen dieses Reviers (Migration 109).
  //
  // **Server-seitig geladen, nicht in der Komponente**, damit die Summenzeile
  // sofort dasteht — sie ist die Antwort auf „hat der schon gezahlt", und die
  // will man sehen, ohne etwas aufzuklappen.
  //
  // **`.in(...)` auf die Schein-IDs, und das ist dieselbe Bauform, vor der
  // A-B3 warnt** (ungechunkte `in`-Liste, GET-URL kann zu lang werden). Hier
  // vertretbar und nicht dasselbe Risiko: es sind die Scheine EINES Reviers —
  // heute vier, realistisch ein paar Dutzend —, während A-B3 die Stände eines
  // Reviers meint, die in die Hunderte gehen. **Wird es je eng, ist der Ausweg
  // ein eingebetteter Filter** (`hunting_licenses!inner(district_id)`), nicht
  // ein Chunking.
  //
  // Der Leerlauf-Fall muss abgefangen werden: `.in('…', [])` schickt PostgREST
  // ein leeres Tupel und ergibt einen Syntaxfehler, keine leere Liste.
  //
  // **`count: 'exact'` ist kein Luxus, sondern der Riegel gegen eine falsche
  // Geldzahl** (Fremdprüfung 06.08.2026): PostgREST liefert höchstens 1000
  // Zeilen und sagt es nicht. Weil hier absteigend sortiert wird, fielen bei
  // Überschreitung ausgerechnet die ÄLTESTEN Zahlungen weg — die Summenzeile
  // zeigte zu wenig, ohne dass irgendwo ein Fehler stünde. Genau der Fall, den
  // `geladen()` und `zahlungenSumme()` laut ihren eigenen Kommentaren
  // verhindern sollen: lieber nichts anzeigen als eine falsche Zahl.
  // Realistisch Jahre entfernt (30 Scheine × monatlich × 3 Jahre ≈ 1080) — aber
  // eine stille falsche Zahl über Geld ist der teuerste Fehler, den diese Seite
  // machen kann, und der Riegel kostet drei Zeilen.
  const antwort =
    scheine.length === 0
      ? null
      : await supabase
          .from('schein_zahlungen')
          .select('id, hunting_license_id, betrag, erhalten_am, notiz', { count: 'exact' })
          .in(
            'hunting_license_id',
            scheine.map((s) => s.id)
          )
          // Jüngste zuerst — dieselbe Richtung wie die Scheinliste selbst.
          // **`id` als zweiter Schlüssel**, weil zwei Zahlungen am selben Tag
          // ausdrücklich legitim sind (Anzahlung und Rest) und ohne ihn
          // zwischen zwei Aufrufen die Plätze tauschen könnten.
          .order('erhalten_am', { ascending: false })
          .order('id')
  const zahlungen = antwort === null ? [] : geladen<Zahlung[]>(antwort, 'Zahlungen')
  // `?? 0` schaltet den Riegel bei fehlendem Count still ab. Folgenlos und
  // geprüft: mit `{ count: 'exact' }` liefert PostgREST ihn auf jedem
  // Erfolgsweg, und jeder Fehlerweg wirft schon eine Zeile vorher in
  // `geladen()` (Schlusslesung 06.08.2026).
  if (antwort !== null && (antwort.count ?? 0) > zahlungen.length) {
    throw new Error(
      `Zahlungen konnten nicht vollständig geladen werden: ${antwort.count} vorhanden, ` +
        `${zahlungen.length} geliefert. Die Summe wäre zu niedrig.`
    )
  }

  // Alle Objekte des Reviers holen und hier filtern, statt die Typenliste aus
  // objekte.ts zu exportieren: drei schmale Spalten über wenige hundert Zeilen
  // kosten nichts, und die Datei bleibt unangetastet (R1).
  const objekte = geladen<{ id: string; name: string; type: string }[]>(
    await supabase.from('map_objects').select('id, name, type').eq('district_id', revier.id).order('name'),
    'Kartenobjekte'
  )
  const staende: StandWahl[] = objekte
    .filter((o) => istStand(o.type))
    .map((o) => ({ id: o.id, name: o.name || typLabel(o.type), typ: typLabel(o.type) }))

  return (
    <div className="zentrale-wrap">
      <h1>Jagderlaubnisse</h1>
      <p className="zentrale-sub">{revier.name}</p>

      <Ausstellen
        revierId={revier.id}
        bundesland={revier.bundesland}
        ausstellerId={user.id}
        staende={staende}
        scheine={scheine}
        zahlungen={zahlungen}
        // Der Tag kommt vom Server: der Container läuft auf UTC wie die DB,
        // das Endgerät des Betrachters muss das nicht. Sonst beschriftete eine
        // falsch gestellte Uhr die Scheine anders, als 077 sie behandelt.
        heute={heuteUtc()}
      />

      <Einloesen />
    </div>
  )
}
