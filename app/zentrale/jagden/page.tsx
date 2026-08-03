import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geladen } from '../laden'
import Liste from './liste'
import { alsFilter, ersterWert, zusagen, type Jagd, type Teilnahme } from './jagden'
import './jagden.css'

/**
 * Jagden — Portal-Phase 4a (`QuickHunt_Konzept_Revierzentrale_V1.md` §5).
 *
 * Der Bereich bereitet Jagden VOR. Der Jagdtag läuft nativ; aktive Jagden sind
 * hier read-only (§3: "ein offener Browser darf keine laufende Feldsituation
 * umschreiben").
 *
 * **Was nativ fehlt und diese Seite deshalb füllt** (Recon 03.08.2026):
 * nachträglich einladen, Termin ändern, Name/Jagdart ändern, Rollen setzen —
 * alle vier gibt es in der App nicht. Rollen sind sogar ausdrücklich hierher
 * verwiesen (Backlog E5: "KEINE native Rollenverwaltung, übergangsweise
 * PWA/SQL").
 */

type Suchparameter = { [k: string]: string | string[] | undefined }

interface Revier {
  id: string
  name: string
}

export default async function JagdenPage({
  searchParams,
}: {
  searchParams: Promise<Suchparameter>
}) {
  const { revier: revierParam, filter } = await searchParams
  const gewuenscht = ersterWert(revierParam)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login: der Proxy ist der Wächter für /zentrale. Bounct
  // die Seite zusätzlich, kann bei einer Abweichung eine Schleife entstehen.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagden</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Seite braucht eine Anmeldung.{' '}
            <a href="/login?next=/zentrale/jagden">Zum Login</a>.
          </p>
        </div>
      </div>
    )
  }

  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name')
      .eq('owner_id', user.id)
      .eq('hidden', false)
      .order('name'),
    'Reviere'
  )

  if (reviere.length === 0) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagden</h1>
        <p className="zentrale-sub">Kein eigenes Revier</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Jagden vorbereiten kann nur, wem das Revier gehört. Reviere anlegen
            und einblenden geht im Du-Tab der Feld-App.
          </p>
        </div>
      </div>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2) — dieselbe kanonische Adresse wie
  // auf der Übersicht, damit der Wechsler der Seitenleiste weiterträgt.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/jagden?revier=${reviere[0].id}`)

  // Sichtbar ist, was RLS durchlässt: Ersteller und Teilnehmer der Jagd. Der
  // Revierbesitzer als solcher hat KEINE eigene hunts-Policy — eine fremd
  // angelegte Jagd im eigenen Revier fehlt hier also ganz.
  //
  // Heute folgenlos: alle 39 Jagden im Bestand hat Moritz selbst angelegt
  // (gemessen 03.08.2026, 0 fremde). Der Fall entsteht erst mit mehreren
  // Revier-Admins — Moritz hat sie am 03.08. als eigenen Block nach hinten
  // gestellt ("noch nicht so dringend"). Wenn er kommt, ist DIESE Query die
  // Stelle, die davon als Erstes etwas merkt: aus "keine Jagden" wird dann
  // stillschweigend "nicht meine Jagden".
  const jagden = geladen<Jagd[]>(
    await supabase
      .from('hunts')
      .select('id, name, type, status, scheduled_for, started_at, ended_at, created_at')
      .eq('district_id', revier.id),
    'Jagden'
  )

  // Zusagen in einer zweiten Query statt als eingebetteter Count: PostgREST
  // kann nicht zwei gefilterte Counts nebeneinander liefern (zugesagt UND
  // offen), und bei 39 Jagden × ~4 Teilnehmern sind es 88 schmale Zeilen.
  //
  // Ohne Jagden gar nicht erst fragen: `.in('hunt_id', [])` serialisiert die
  // Bibliothek zu `in.()`, was PostgREST nicht annimmt (gleiche Falle wie in
  // ../page.tsx).
  const teilnahmen =
    jagden.length === 0
      ? []
      : geladen<Teilnahme[]>(
          await supabase
            .from('hunt_participants')
            .select('hunt_id, status')
            .in(
              'hunt_id',
              jagden.map((j) => j.id)
            ),
          'Teilnehmer'
        )

  return (
    <div className="zentrale-wrap">
      <h1>Jagden</h1>
      <p className="zentrale-sub">{revier.name}</p>
      <Liste
        jagden={jagden}
        zusagen={Object.fromEntries(zusagen(teilnahmen))}
        filter={alsFilter(ersterWert(filter))}
        revierId={revier.id}
      />
    </div>
  )
}
