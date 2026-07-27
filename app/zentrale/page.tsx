import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parsePointHex, parsePolygonHex } from '@/lib/geo-utils'
import Revierkarte from './revierkarte'
import type { Punkt } from './revierkarte-map'
// Importierbar auch serverseitig: schreiben.ts hat bewusst keine Imports und
// damit keine Browser-Abhängigkeit.
import { darfSchreiben } from './schreiben'

/** Alles, worauf ein Schütze sitzt. Kirrung, Salzlecke, Wildkamera,
 *  Parkplatz und Sonstiges zählen bewusst nicht als Sitz. */
const STAND_TYPEN = ['hochsitz', 'kanzel', 'drueckjagdstand']

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

type Revier = { id: string; name: string; area_ha: number | null; boundary: unknown }
type Jagd = {
  id: string
  name: string
  type: string | null
  status: string | null
  scheduled_for: string | null
}
type Objekt = { id: string; name: string; type: string; position: unknown }

/**
 * Fehler nicht verschlucken. Auf einer Kennzahlenseite ist die stille Null die
 * schlimmste Ausgabe: ein RLS-Bruch oder Netzausfall sähe aus wie „keine Jagd,
 * keine Strecke" und wäre von einem echten leeren Revier nicht zu unterscheiden.
 * Lieber werfen und error.tsx sagen lassen, dass die Zahl gerade nicht bekannt ist.
 */
function geladen<T>({ data, error }: { data: unknown; error: { message: string } | null }, was: string): T {
  if (error) throw new Error(`${was} konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as T
}

/** PostgREST liefert geometry als GeoJSON; der Hex-Pfad ist der Fallback für
 *  andere Aufrufer (dieselbe Asymmetrie wie in parsePolygonHex). */
function punktAus(input: unknown): { lat: number; lng: number } | null {
  if (input && typeof input === 'object' && 'type' in input && 'coordinates' in input) {
    const geo = input as { type: string; coordinates: number[] }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return { lat: geo.coordinates[1], lng: geo.coordinates[0] }
    }
    return null
  }
  return typeof input === 'string' ? parsePointHex(input) : null
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

  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name, area_ha, boundary')
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
      .select('id, name, type, status, scheduled_for')
      .eq('district_id', revier.id),
    'Jagden'
  )

  const objekte = geladen<Objekt[]>(
    await supabase
      .from('map_objects')
      .select('id, name, type, position')
      .eq('district_id', revier.id),
    'Kartenobjekte'
  )

  // Umweg über die Jagd-IDs, weil kills.district_id von keinem Client
  // geschrieben wird (Konzept §4.1). Genau deshalb steht unter der Kennzahl
  // eine Fußnote statt einer blanken Zahl.
  // Ohne Jagden gar nicht erst fragen: .in('hunt_id', []) serialisiert die
  // Bibliothek zu `in.()`, was PostgREST nicht annimmt.
  let strecke = 0
  if (jagden.length > 0) {
    const { count, error } = await supabase
      .from('kills')
      .select('id', { count: 'exact', head: true })
      .in(
        'hunt_id',
        jagden.map((j) => j.id)
      )
    if (error) throw new Error(`Strecke konnte nicht geladen werden: ${error.message}`)
    strecke = count ?? 0
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

  const sitze = objekte.filter((o) => STAND_TYPEN.includes(o.type)).length
  const grenze = parsePolygonHex(revier.boundary)
  const punkte = objekte.reduce<Punkt[]>((acc, o) => {
    const p = punktAus(o.position)
    if (p) acc.push({ id: o.id, name: o.name, typ: o.type, lat: p.lat, lng: p.lng })
    return acc
  }, [])

  return (
    <div className="zentrale-wrap">
      <h1>{revier.name}</h1>
      <p className="zentrale-sub">Übersicht · nur lesend</p>

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
          fuss={`von ${objekte.length} ${objekte.length === 1 ? 'Kartenobjekt' : 'Kartenobjekten'}`}
        />
      </div>

      <section className="zentrale-block">
        <h2>Revierkarte</h2>
        <div className="zentrale-karte">
          {/* Auch bei völlig leerem Revier die Karte zeigen, sofern hineingeschrieben
              werden darf — sonst gäbe es keinen Ort, an dem die erste Grenze
              entstehen könnte. */}
          {grenze || punkte.length > 0 || darfSchreiben(revier.id) ? (
            <Revierkarte grenze={grenze} punkte={punkte} revierId={revier.id} />
          ) : (
            <div className="zentrale-karte-lade">
              Für dieses Revier ist weder eine Grenze noch ein Objekt hinterlegt.
            </div>
          )}
        </div>
      </section>

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
                  <td className="num">{datumZeit.format(new Date(j.scheduled_for!))}</td>
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
