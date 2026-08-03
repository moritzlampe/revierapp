import { createClient } from '@/lib/supabase/server'
import Liste from './liste'
import { alsFilter, ersterWert, type Kontakt } from './kontakte'
import './gaeste.css'
import { geladen } from '../laden'

/**
 * Gäste — die persönliche Kontaktliste (Gästestamm).
 *
 * Konzept: `QuickHunt_Konzept_Kontaktliste_V1.md` (GELOCKT 01.08.2026),
 * Tabelle aus Migration 085. Sechster Bereich der Zentrale (§8.1).
 *
 * **Diese Seite wertet `?revier=` ausdrücklich NICHT aus, und das ist der
 * einzige Ort im Portal, an dem das so ist.** Die Liste gehört einer Person,
 * nicht einem Revier (Konzept §8.1) — Moritz' Vater lädt zu Söder *und*
 * Brockwinkel ein, eine reviergebundene Liste hieße, dieselben Menschen
 * zweimal zu führen. Die Seitenleiste hängt den Parameter trotzdem an jeden
 * Link; er wird hier still durchgereicht, damit der Wechsel zurück in einen
 * revier-gebundenen Bereich seinen Geltungsbereich behält.
 *
 * **Kein `redirect()` auf eine kanonische URL** — anders als
 * `../jagderlaubnisse/page.tsx:92`. Wer das von dort kopiert, baut aus einer
 * personengebundenen Liste wieder eine reviergebundene.
 *
 * **Was RLS hier tut (Migration 085):** sichtbar ist, was
 * `get_my_kontaktbuecher()` deckt — das eigene Adressbuch plus die, für die man
 * als Mitführender eingetragen ist. Die Anzeige filtert nicht selbst nach
 * `besitzer_id`; die Policy ist die Grenze, nicht eine `.eq()`-Bedingung.
 */

/**
 * Der echte Typ, den Next liefert: **jeder** Parameter kann `string[]` sein,
 * sobald er mehrfach in der Adresse steht. Deshalb geht alles durch
 * `ersterWert()` — Begründung dort, gegengeprüft im Selbsttest.
 */
type Suchparameter = { [k: string]: string | string[] | undefined }

/** Fehler nicht verschlucken — gleiche Haltung wie `geladen()` in ../page.tsx.
 *  ponytail: dritte Kopie dieser vier Zeilen im Portal. Zusammenlegen, sobald
 *  eine vierte dazukommt — dann ist es ein Muster und kein Zufall. */
export default async function GaestePage({
  searchParams,
}: {
  searchParams: Promise<Suchparameter>
}) {
  const { q, filter } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login: der Proxy ist der Wächter für /zentrale. Bounct
  // die Seite zusätzlich, kann bei einer Abweichung eine Schleife entstehen.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Gäste</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Seite braucht eine Anmeldung. <a href="/login?next=/zentrale/gaeste">Zum Login</a>.
          </p>
        </div>
      </div>
    )
  }

  // Alle Spalten außer `besitzer_id`, `profil_id` und den Zeitstempeln: die
  // Liste zeigt sie nicht, und `profil_id` gehört bewusst nicht in die
  // Oberfläche — sie beantwortete sonst „ist diese Person schon Nutzer?"
  // (Konzept §5.3, das Orakel-Verbot).
  //
  // Sortierung nach Konzept §3.1. `nullsFirst: false` ist das `nulls last` aus
  // der Vorgabe; ohne die Angabe sortiert Postgres NULL bei aufsteigender
  // Ordnung ans Ende — verlassen sollte man sich darauf nicht.
  const kontakte = geladen<Kontakt[]>(
    await supabase
      .from('kontakte')
      .select(
        'id, vorname, nachname, begleitung, email, telefon, handy, adresse, geburtstag, notiz, kuerzel, kategorien, standard_tags',
      )
      .order('nachname', { ascending: true, nullsFirst: false })
      .order('vorname', { ascending: true, nullsFirst: false }),
    'Kontakte',
  )

  return (
    <div className="zentrale-wrap">
      <h1>Gäste</h1>
      {/* Dort, wo auf den anderen fünf Seiten der Reviername steht, steht hier
          der Geltungsbereich. Genau da sucht ihn der Leser — und dass er etwas
          anderes findet, ist die ganze Erklärung. Kein Hinweiskasten: der
          machte aus einer Eigenschaft eine Entschuldigung. */}
      <p className="zentrale-sub">
        Persönliche Gästeliste · gilt für alle Reviere · {kontakte.length}{' '}
        {kontakte.length === 1 ? 'Kontakt' : 'Kontakte'}
      </p>

      {/* `besitzerId` kommt vom Server, nicht aus einem Client-`getUser()`:
          ein neuer Kontakt braucht `besitzer_id` beim INSERT (NOT NULL, und
          danach durch den Trigger aus 085 fest). Derselbe Weg wie
          `ausstellerId` in ../jagderlaubnisse. */}
      <Liste
        kontakte={kontakte}
        besitzerId={user.id}
        startSuche={ersterWert(q)}
        startFilter={alsFilter(ersterWert(filter))}
      />
    </div>
  )
}
