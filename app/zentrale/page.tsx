import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { STAND_TYPEN } from './objekte'
import { geladen } from './laden'
// Statt eines zweiten Intl-Formatters daneben: `terminText(…, false)` ist
// bereits das Datum ohne Uhrzeit in Berliner Zeit. Der Endtermin einer
// mehrtägigen Jagd ist ein Tag, keine Feierabendzeit (Migration 095).
import { mehrtaegig, terminText } from './jagden/jagden'

// Die Jagdart steckt in hunts.type, NICHT in hunts.kind (das kennt nur
// group/solo). Alle vier Werte werden getragen, auch die heute ungenutzten
// (Konzept §4.3).
const JAGDART: Record<string, string> = {
  ansitz: 'Ansitz',
  pirsch: 'Pirsch',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}

const JAGDSTATUS: Record<string, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  active: 'Läuft',
  paused: 'Pausiert',
  completed: 'Beendet',
  auto_completed: 'Beendet',
}

// Fest auf Berlin: der Container läuft in UTC, sonst stünde eine 07:15-Jagd
// im Sommer als 05:15 in der Liste.
const datumZeit = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})
const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

type Revier = { id: string; name: string; area_ha: number | null }
type Jagd = {
  id: string
  name: string
  type: string | null
  status: string | null
  scheduled_for: string | null
  scheduled_until: string | null
}

/**
 * Fehler nicht verschlucken. Auf einer Kennzahlenseite ist die stille Null die
 * schlimmste Ausgabe: ein RLS-Bruch oder Netzausfall sähe aus wie „keine Jagd,
 * keine Strecke" und wäre von einem echten leeren Revier nicht zu unterscheiden.
 * Lieber werfen und error.tsx sagen lassen, dass die Zahl gerade nicht bekannt ist.
 *
 * **Der Zähler ist bei `head: true` die EINZIGE Auskunft, und deshalb wirft ein
 * fehlender** (Fremdprüfung 08.08.2026, F3/F6). Die erste Fassung schrieb
 * `count ?? 0` — bei fehlendem `Content-Range` wurde daraus eine glaubwürdige
 * „0 Sitze", obwohl die Abfrage gar keine Zeilen überträgt, an denen man den
 * Irrtum bemerken könnte. Das ist zeichengleich der Fehler, der am selben
 * Vormittag in `laden.ts` geschlossen wurde: `(count ?? 0)` in
 * `jagderlaubnisse` konnte ohne Zähler nie feuern. Zweimal am selben Tag
 * dieselbe Klasse — `?? 0` auf einem Zähler ist in diesem Projekt ein
 * Codegeruch.
 *
 * **`Number.isFinite`, nicht `!= null`** — aus demselben Grund wie dort:
 * supabase-js rechnet `parseInt(contentRange[1])` ungeprüft, bei
 * `Content-Range: 0-999/*` ist das NaN. `NaN ?? 0` ist NaN, und die Kennzahl
 * stünde als „NaN" auf der Seite.
 */
async function zaehle(
  bauen: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  was: string
): Promise<number> {
  const { count, error } = await bauen()
  if (error) throw new Error(`${was} konnte nicht gezählt werden: ${error.message}`)
  // `== null` zuerst, damit TypeScript danach `number` weiß — `Number.isFinite`
  // ist kein Type Guard, und ein `as number` wäre genau die Behauptung, gegen
  // die diese Zeilen gebaut sind.
  if (count == null || !Number.isFinite(count)) {
    throw new Error(
      `${was}: PostgREST hat keinen brauchbaren Zähler geliefert (${count}). Die Abfrage ` +
        `überträgt keine Zeilen, aus denen sich die Zahl sonst ergäbe.`
    )
  }
  return count
}

export default async function ZentraleUebersicht({
  searchParams,
}: {
  searchParams: Promise<{ revier?: string }>
}) {
  const { revier: gewuenscht } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Bewusst kein Redirect auf /login: der Proxy ist der Wächter für /zentrale.
  // Bounct die Seite zusätzlich, kann bei einer Abweichung zwischen beiden eine
  // Endlosschleife entstehen (Proxy sieht Session, Server-Komponente nicht).
  if (!user) {
    return (
      <Hinweis titel="Nicht angemeldet" unterzeile="Sitzung fehlt oder ist abgelaufen">
        Diese Seite braucht eine Anmeldung. <a href="/login?next=/zentrale">Zum Login</a>.
      </Hinweis>
    )
  }

  // `boundary` wird hier nicht mehr geladen: seit die Karte im Bereich „Revier"
  // sitzt (08.08.2026), braucht die Übersicht von der Grenze nur noch das
  // fertig gerechnete `area_ha`. Das ist bei Söder ein Polygon mit einigen
  // hundert Stützpunkten je Seitenaufruf, das niemand mehr ansieht.
  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name, area_ha')
      .eq('owner_id', user.id)
      .eq('hidden', false)
      .order('name'),
    'Reviere'
  )

  if (reviere.length === 0) {
    return (
      <Hinweis titel="Revierzentrale" unterzeile="Kein sichtbares Revier">
        Diesem Konto ist kein Revier zugeordnet, oder alle sind im Du-Tab der
        Feld-App ausgeblendet. Reviere anlegen und einblenden geht dort.
      </Hinweis>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2). Fehlt oder passt sie nicht, wird auf
  // die kanonische Adresse umgeleitet — danach ist der Zustand der Seitenleiste
  // aus der URL ableitbar und muss nicht ein zweites Mal hergeleitet werden.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale?revier=${reviere[0].id}`)

  // Sichtbar ist, was RLS durchlässt: Ersteller und Teilnehmer der Jagd. Der
  // Revierbesitzer als solcher hat keine eigene hunts-Policy — fremd angelegte
  // Jagden im eigenen Revier fehlen der Zählung also. Für den Piloten deckungs-
  // gleich (Moritz hat alle 17 selbst angelegt), aber keine Ewigkeitsgarantie.
  const jagden = geladen<Jagd[]>(
    await supabase
      .from('hunts')
      .select('id, name, type, status, scheduled_for, scheduled_until')
      .eq('district_id', revier.id),
    'Jagden'
  )

  // **Gezählt, nicht geladen** — seit dem 08.08.2026, als die Karte in den
  // Bereich „Revier" gezogen ist. Vorher holte diese Seite jedes Objekt mit
  // Position, Beschreibung und Foto-URL (Söder: 196 Zeilen), um daraus zwei
  // Zahlen zu bilden und den Rest an die Karte zu reichen. Die Karte ist weg,
  // die Zahlen bleiben.
  //
  // Das erledigt zugleich den heißesten Teil von C-25: die Objektabfrage war
  // der Lesepfad der Zentrale mit dem kleinsten Abstand zur PostgREST-Grenze.
  // Ein `head`-Count kann gar nicht abgeschnitten werden — er überträgt keine
  // Zeilen, nur den Zähler.
  const [objekteGesamt, sitze] = await Promise.all([
    zaehle(
      () =>
        supabase
          .from('map_objects')
          .select('id', { count: 'exact', head: true })
          .eq('district_id', revier.id),
      'Kartenobjekte'
    ),
    // `STAND_TYPEN` statt einer zweiten Aufzählung: dieselbe Definition, aus
    // der auch `istStand()` liest.
    zaehle(
      () =>
        supabase
          .from('map_objects')
          .select('id', { count: 'exact', head: true })
          .eq('district_id', revier.id)
          .in('type', STAND_TYPEN),
      'Sitze'
    ),
  ])

  // Umweg über die Jagd-IDs, weil kills.district_id von keinem Client
  // geschrieben wird (Konzept §4.1). Genau deshalb steht unter der Kennzahl
  // eine Fußnote statt einer blanken Zahl.
  // Ohne Jagden gar nicht erst fragen: .in('hunt_id', []) serialisiert die
  // Bibliothek zu `in.()`, was PostgREST nicht annimmt.
  let strecke = 0
  if (jagden.length > 0) {
    strecke = await zaehle(
      () =>
        supabase
          .from('kills')
          .select('id', { count: 'exact', head: true })
          .in(
            'hunt_id',
            jagden.map((j) => j.id)
          ),
      'Strecke'
    )
  }

  const jetzt = new Date()
  const naechste = jagden
    .filter(
      (j) =>
        j.scheduled_for !== null &&
        new Date(j.scheduled_for) >= jetzt &&
        j.status !== 'completed' &&
        j.status !== 'auto_completed'
    )
    .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!))
    .slice(0, 5)

  // Laufende Jagd: nur ein Hinweis, keine Live-Steuerung (§1.3, §3).
  const laufend = jagden.find((j) => j.status === 'active' || j.status === 'paused')

  return (
    <div className="zentrale-wrap">
      <h1>{revier.name}</h1>
      {/* Seit dem Wegfall der R3-Allowlist (29.07.2026) gilt für jedes Revier
          dasselbe, also sagt die Zeile nichts mehr über Rechte. Sie sagte das
          vorher, weil es zwei Fälle gab; einen Hinweis stehen zu lassen, der
          immer denselben Text zeigt, ist schlechter als keiner. */}
      <p className="zentrale-sub">Übersicht</p>

      {laufend && (
        <div className="zentrale-live">
          <span>
            <strong>{laufend.name}</strong> läuft gerade.
          </span>
          <a href={`/app/hunt/${laufend.id}`}>In der App öffnen ↗</a>
        </div>
      )}

      <div className="zentrale-kennzahlen">
        <Kennzahl label="Jagden" wert={String(jagden.length)} fuss="im Revier insgesamt" />
        <Kennzahl
          label="Strecke"
          wert={String(strecke)}
          fuss="nur über Jagden zuordenbar — kills.district_id wird noch nicht geschrieben"
        />
        <Kennzahl
          label="Fläche"
          wert={revier.area_ha === null ? '—' : zahl.format(revier.area_ha)}
          einheit={revier.area_ha === null ? undefined : 'ha'}
          fuss={revier.area_ha === null ? 'keine Grenze gezeichnet' : 'aus der Reviergrenze'}
        />
        <Kennzahl
          label="Sitze"
          wert={String(sitze)}
          fuss={`von ${objekteGesamt} ${objekteGesamt === 1 ? 'Kartenobjekt' : 'Kartenobjekten'}`}
        />
      </div>

      <section className="zentrale-block">
        <h2>Nächste Jagden</h2>
        {naechste.length === 0 ? (
          <p className="zentrale-leer">Keine Jagd mit Termin in der Zukunft.</p>
        ) : (
          <table className="zentrale-tabelle">
            <thead>
              <tr>
                <th scope="col">Termin</th>
                <th scope="col">Jagd</th>
                <th scope="col">Art</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {naechste.map((j) => (
                <tr key={j.id}>
                  {/* Eine mehrtägige Jagd, die hier nur ihren Starttag zeigt,
                      sieht aus wie ein Abendansitz — der Unterschied ist genau
                      das, was „was ist als Nächstes vorzubereiten" beantwortet. */}
                  <td className="num">
                    {datumZeit.format(new Date(j.scheduled_for!))}
                    {mehrtaegig(j.scheduled_for, j.scheduled_until)
                      ? ` – ${terminText(j.scheduled_until, false)}`
                      : ''}
                  </td>
                  <td>{j.name}</td>
                  <td>{j.type ? (JAGDART[j.type] ?? j.type) : '—'}</td>
                  <td>
                    <span className="zentrale-pill">
                      {j.status ? (JAGDSTATUS[j.status] ?? j.status) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Hinweis({
  titel,
  unterzeile,
  children,
}: {
  titel: string
  unterzeile: string
  children: React.ReactNode
}) {
  return (
    <div className="zentrale-wrap">
      <h1>{titel}</h1>
      <p className="zentrale-sub">{unterzeile}</p>
      <div className="zentrale-note">
        <p style={{ margin: 0 }}>{children}</p>
      </div>
    </div>
  )
}

function Kennzahl({
  label,
  wert,
  einheit,
  fuss,
}: {
  label: string
  wert: string
  einheit?: string
  fuss: string
}) {
  return (
    <div className="zentrale-kennzahl">
      <div className="lbl">{label}</div>
      <div className="wert">
        {wert}
        {einheit && <span className="einheit"> {einheit}</span>}
      </div>
      <div className="fuss">{fuss}</div>
    </div>
  )
}
