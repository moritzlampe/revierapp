import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geladen } from '../../laden'
import Detail from './detail'
import {
  ersterWert,
  type EinladbarerKontakt,
  type Jagd,
  type Profil,
  type Teilnehmer,
} from '../jagden'
import '../jagden.css'

/**
 * Eine einzelne Jagd vorbereiten — Portal-Phase 4a.
 *
 * Was hier geht: Name, Termin und Jagdart ändern, Teilnehmer einladen und
 * entfernen, Rolle und Tag setzen. Was nicht geht: Treiben und Stände (4b),
 * die Jagd starten oder beenden (Konzept §3 — der Jagdtag gehört der App), das
 * Revier wechseln, und die Rolle `jagdleiter` vergeben.
 */

interface Revier {
  id: string
  name: string
}

export default async function JagdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  // Das Revier steht in der Adresse, damit der Wechsler der Seitenleiste es
  // weiterträgt (Konzept §1.2). `ersterWert`, weil Next jeden Parameter als
  // `string[]` liefert, sobald er mehrfach in der Adresse steht.
  const { revier: revierParam, chat } = await searchParams
  const inAdresse = ersterWert(revierParam)
  const chatFehlt = ersterWert(chat) === 'fehlt'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login — der Proxy ist der Wächter für /zentrale.
  // Gleiche Begründung wie in ../page.tsx.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagd</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Seite braucht eine Anmeldung.{' '}
            <a href={`/login?next=/zentrale/jagden/${id}`}>Zum Login</a>.
          </p>
        </div>
      </div>
    )
  }

  // `maybeSingle`, nicht `single`: eine Jagd, die RLS nicht durchlässt, ist
  // hier kein Serverfehler, sondern die Auskunft „gibt es für dich nicht".
  const { data: jagd, error: jagdFehler } = await supabase
    .from('hunts')
    .select('id, name, type, status, scheduled_for, started_at, ended_at, created_at, creator_id, district_id')
    .eq('id', id)
    .maybeSingle()

  if (jagdFehler) throw new Error(`Die Jagd konnte nicht geladen werden: ${jagdFehler.message}`)

  if (!jagd) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagd</h1>
        <p className="zentrale-sub">Nicht gefunden</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Jagd gibt es nicht, oder sie gehört zu keinem Revier, das du
            siehst. <Link href="/zentrale/jagden">Zurück zur Liste</Link>.
          </p>
        </div>
      </div>
    )
  }

  // Das Revier der Jagd — und zugleich die Prüfung, ob es ein eigenes ist.
  const reviere = geladen<Revier[]>(
    await supabase.from('districts').select('id, name').eq('owner_id', user.id).eq('hidden', false),
    'Reviere'
  )
  const revier = reviere.find((r) => r.id === jagd.district_id)

  // Der Chat-Hinweis überlebt den Redirect — sonst verschwände er genau dann,
  // wenn er gebraucht wird (direkt nach dem Anlegen).
  if (revier && inAdresse !== revier.id) {
    redirect(`/zentrale/jagden/${id}?revier=${revier.id}${chatFehlt ? '&chat=fehlt' : ''}`)
  }

  const teilnehmer = geladen<Teilnehmer[]>(
    await supabase
      .from('hunt_participants')
      .select('id, user_id, guest_name, role, tags, status')
      .eq('hunt_id', id),
    'Teilnehmer'
  )

  // Alle Profile in einem Rutsch: `profiles_select_authenticated` lässt jeden
  // Angemeldeten alle Zeilen sehen, und im Bestand sind es 9 (03.08.2026). Eine
  // Suche wäre bei dieser Menge Zierat; wenn sie fällig wird, ist es dieselbe
  // Stelle wie nativ (`fetchInvitableProfiles`, ebenfalls ohne Suche).
  const profile = geladen<Profil[]>(
    await supabase.from('profiles').select('id, display_name').order('display_name'),
    'Profile'
  )

  // **Das Adressbuch — die Menschen ohne Konto** (Moritz, 03.08.2026: „wir
  // werden aber ja auch jagden anlegen mit leuten die noch keinen haben oder
  // nie haben werden"). RLS ist die Grenze, nicht eine `.eq()`-Bedingung:
  // `get_my_kontaktbuecher()` deckt das eigene Adressbuch plus die, für die man
  // als Mitführender eingetragen ist (Migration 085) — dieselbe Haltung wie in
  // `../../gaeste/page.tsx`.
  //
  // **`profil_id` wird NICHT geladen**, obwohl das Zusammenlegen von Konto und
  // Kontakt daran hinge: sie beantwortete „ist diese Person schon Nutzer?" und
  // ist deshalb aus der Oberfläche verbannt (Konzept Kontaktliste §5.3, das
  // Orakel-Verbot). Im Bestand ist sie ohnehin bei 0 von 154 gesetzt.
  // **Stillgelegte Kontakte kommen hier gar nicht an** (Migration 100,
  // Fremdprüfung 04.08.2026, Punkt 7). Der Filter sitzt in der ABFRAGE und nicht
  // in `kandidaten()`: dann kann kein Codeweg im Client versehentlich einen
  // inaktiven Kontakt anbieten, und der Zustand ist genau dort wirksam, wo er
  // seinen Zweck hat. Wer als Aktiver eingeladen wurde und danach stillgelegt
  // wird, bleibt Teilnehmer — die `hunt_participants`-Zeile ist unberührt, hier
  // geht es allein um die Auswahl der NOCH NICHT Eingeladenen.
  const kontakte = geladen<EinladbarerKontakt[]>(
    await supabase
      .from('kontakte')
      .select('id, vorname, nachname, kategorien')
      .is('inaktiv_seit', null)
      .order('nachname', { ascending: true, nullsFirst: false })
      .order('vorname', { ascending: true, nullsFirst: false }),
    'Kontakte'
  )

  // **Die Rechtefrage, und sie ist der Grund, warum diese Seite sie serverseitig
  // stellt:** Ersteller ODER wer die Rolle trägt UND zugesagt hat. Zeichengleich
  // zu `istJagdleiter()` in `src/lib/hunt/leitung.ts` der App, additiv seit
  // Migration 089.
  //
  // Ohne diese Prüfung zeigte die Seite jedem Teilnehmer die Bearbeiten-Knöpfe,
  // und die DB wiese sie mit `42501` ab — der S2-Fall aus dem Standard-Focus:
  // ein Knopf für jemanden, dem RLS das Schreiben verweigert.
  const eigene = teilnehmer.find((t) => t.user_id === user.id)
  const istLeiter =
    jagd.creator_id === user.id || (eigene?.status === 'joined' && eigene?.role === 'jagdleiter')

  return (
    <div className="zentrale-wrap">
      {chatFehlt ? (
        <div className="zentrale-note" role="alert">
          <p style={{ margin: 0 }}>
            Die Jagd ist angelegt, <strong>der Gruppenchat konnte nicht erstellt
            werden</strong>. Einladungen und Termin funktionieren; wer zusagt,
            landet aber in keiner Chat-Gruppe. Nachträglich anlegen lässt sich
            der Chat derzeit weder hier noch in der App — wer ihn braucht, legt
            die Jagd in der Feld-App neu an und lässt diese liegen.
          </p>
        </div>
      ) : null}
      <Detail
        jagd={jagd as Jagd}
        revierName={revier?.name ?? null}
        revierId={revier?.id ?? null}
        teilnehmer={teilnehmer}
        profile={profile}
        kontakte={kontakte}
        eigeneId={user.id}
        erstellerId={jagd.creator_id}
        istLeiter={istLeiter}
      />
    </div>
  )
}
