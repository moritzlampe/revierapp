import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { istStand, typLabel } from '../objekte'
import Ausstellen, { Einloesen } from './formular'
import type { StandWahl, ScheinZeile } from './formular'
import { heuteUtc } from './scheine'
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
        // Der Tag kommt vom Server: der Container läuft auf UTC wie die DB,
        // das Endgerät des Betrachters muss das nicht. Sonst beschriftete eine
        // falsch gestellte Uhr die Scheine anders, als 077 sie behandelt.
        heute={heuteUtc()}
      />

      <Einloesen />
    </div>
  )
}
