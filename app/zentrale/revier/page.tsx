import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parsePointHex, parsePolygonHex } from '@/lib/geo-utils'
import Revierkarte from '../revierkarte'
import type { Punkt } from '../revierkarte-map'
import { geladen, vollstaendig } from '../laden'
import { istStand } from '../objekte'
import { Kennzahl } from '../kennzahl'

const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/**
 * Revier — zweiter Bereich der Zentrale (Konzept §1.1), und der letzte der
 * sechs, der bis zum 08.08.2026 keine eigene Adresse hatte.
 *
 * **Der Karteneditor ist nicht neu — er stand auf der ÜBERSICHT.** Bis heute
 * lag `<Revierkarte>` in `../page.tsx`, weil der Bereich nie eine Route bekam;
 * die Seitenleiste führte ihn deshalb als `fertig: false` und verlinkte ihn
 * gar nicht. Was hier passiert, ist ein Umzug, kein Neubau: dieselbe
 * Komponente, dieselben Daten, dieselben Schreibpfade
 * (`districts.boundary` und `map_objects`, beide in `revierkarte.tsx`).
 *
 * **Warum der Umzug jetzt und nicht später:** die Karte bekommt mit der
 * Jagdplanung (Treiben und Stände, Konzept Phase 4b) einen ZWEITEN Verbraucher.
 * Sie vorher aus einer Seite herauszuoperieren, an der gleichzeitig ein neuer
 * Nutzer andockt, ist der teurere Weg.
 *
 * **Die Kennzahlen bleiben drüben.** „Jagden · Strecke · Fläche · Sitze"
 * beantworten „wie steht mein Revier da" und gehören damit zur Übersicht
 * (§1.3). Nur der Editor gehört hierher — die Zerlegung der Kennzahlenreihe
 * hat niemand bestellt, und zwei halbe Reihen wären schlechter als eine ganze.
 *
 * **Der Absatz darüber galt einen Tag und ist am 08.08.2026 abgelöst worden**
 * (Konzept §1.3a, von Moritz entschieden): *Fläche* und *Sitze* stehen jetzt
 * hier. Er war als **Umzugsentscheidung** richtig — die Reihe zu zerlegen war
 * beim Herausoperieren der Karte nicht bestellt —, hat die eigentliche Frage
 * aber nur vertagt. Der Test, der sie beantwortet: ändert sich die Zahl, weil
 * **ich etwas getan habe**, oder weil **Zeit vergangen ist**? Fläche und Sitze
 * ändern sich ausschließlich durch die Pflegearbeit auf genau dieser Seite;
 * Jagden und Strecke wachsen von selbst und bleiben deshalb drüben.
 *
 * Er steht als Beleg dafür, dass die Reihe nicht versehentlich zerfallen ist.
 */

type Revier = { id: string; name: string; boundary: unknown; area_ha: number | null }
type Objekt = {
  id: string
  name: string
  type: string
  position: unknown
  description: string | null
  photo_url: string | null
}

/**
 * PostgREST liefert geometry als GeoJSON; der Hex-Pfad ist der Fallback für
 * andere Aufrufer (dieselbe Asymmetrie wie in `parsePolygonHex`).
 *
 * Mit der Karte aus `../page.tsx` hierher gezogen — dort ist er nach dem Umzug
 * ohne Aufrufer, weil die Übersicht die Objekte nur noch ZÄHLT.
 */
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

export default async function RevierPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { revier: gewuenschtRoh } = await searchParams
  const gewuenscht = Array.isArray(gewuenschtRoh) ? gewuenschtRoh[0] : gewuenschtRoh
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login: der Proxy ist der Wächter für /zentrale.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Revier</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
      </div>
    )
  }

  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name, boundary, area_ha')
      .eq('owner_id', user.id)
      .eq('hidden', false)
      .order('name'),
    'Reviere'
  )

  if (reviere.length === 0) {
    return (
      <div className="zentrale-wrap">
        <h1>Revier</h1>
        <p className="zentrale-sub">Kein sichtbares Revier</p>
        <p className="zentrale-leer">
          Diesem Konto ist kein Revier zugeordnet, oder alle sind im Du-Tab der
          Feld-App ausgeblendet. Reviere anlegen und einblenden geht dort.
        </p>
      </div>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2) — kanonische Adresse wie überall
  // sonst, damit der Wechsler der Seitenleiste weiterträgt.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/revier?revier=${reviere[0].id}`)

  // `photo_url` statt der Tabelle `map_object_photos`: nachgemessen am
  // 27.07.2026 trägt jedes Objekt mit Foto auch ein `photo_url` (181 von 181,
  // keine Lücke). Die 185 Fotozeilen verteilen sich auf dieselben 181 Objekte —
  // vier haben ein zweites Bild. Eine Galerie einzubetten kostete bei Söder 185
  // zusätzliche Zeilen pro Seitenaufruf und brächte vier Objekten ein zweites
  // Foto.
  // ponytail: Deckenbild statt Galerie. Nachziehen, wenn jemand mehrere Fotos
  // am Desktop sehen will — Fotos aufnehmen bleibt ohnehin mobil.
  //
  // **`count: 'exact'` und `vollstaendig()`, anders als in der Fassung auf der
  // Übersicht.** Die Abfrage ist ungepaged, und von allen Lesepfaden der
  // Zentrale ist ausgerechnet diese die mit dem kleinsten Abstand zur
  // PostgREST-Grenze — wenige Hundert Objekte je Revier (Söder 196, gemessen
  // 08.08.2026). Eine Abschneidung wäre hier besonders tückisch, weil eine
  // Karte mit fehlenden Ständen nicht wie ein Fehler aussieht, sondern wie ein
  // Revier ohne Stände. Der Riegel gehört damit zu C-25, kostet beim Umzug
  // aber nichts, weil die Abfrage ohnehin neu geschrieben wird.
  const objekte = vollstaendig<Objekt>(
    await supabase
      .from('map_objects')
      .select('id, name, type, position, description, photo_url', { count: 'exact' })
      .eq('district_id', revier.id),
    'Kartenobjekte'
  )

  const grenze = parsePolygonHex(revier.boundary)
  const punkte = objekte.reduce<Punkt[]>((acc, o) => {
    const p = punktAus(o.position)
    if (p)
      acc.push({
        id: o.id,
        name: o.name,
        typ: o.type,
        lat: p.lat,
        lng: p.lng,
        beschreibung: o.description,
        fotoUrl: o.photo_url,
      })
    return acc
  }, [])

  return (
    <div className="zentrale-wrap">
      <p className="zentrale-revier">
        <span className="zentrale-revier-label">Revier</span>
        <span className="zentrale-revier-name">{revier.name}</span>
      </p>
      <h1>Revier</h1>
      <p className="zentrale-sub">Grenze, Stände und Kartenobjekte</p>

      {/* **Gezählt statt gefragt.** Die Objekte liegen für die Karte ohnehin
          schon hier — ein `head`-Count daneben wäre eine zweite Wahrheit, die
          von der gezeichneten abweichen kann. `istStand()` statt einer eigenen
          Aufzählung, aus demselben Grund. */}
      <div className="zentrale-kennzahlen">
        <Kennzahl
          label="Fläche"
          wert={revier.area_ha === null ? '—' : zahl.format(revier.area_ha)}
          einheit={revier.area_ha === null ? undefined : 'ha'}
          fuss={revier.area_ha === null ? 'keine Grenze gezeichnet' : 'aus der Reviergrenze'}
        />
        <Kennzahl
          label="Sitze"
          wert={String(objekte.filter((o) => istStand(o.type)).length)}
          fuss={`von ${objekte.length} ${objekte.length === 1 ? 'Kartenobjekt' : 'Kartenobjekten'}`}
        />
      </div>

      <div className="zentrale-block">
        <div className="zentrale-karte">
          {/* Immer die Karte, auch bei völlig leerem Revier — sonst gäbe es
              keinen Ort, an dem die erste Grenze entstehen könnte.

              `key` ist tragend, nicht Kosmetik: beim Revierwechsel ändert sich
              nur `?revier=`, Next behält dieselbe Client-Instanz und damit den
              Editierzustand. Ohne den key lag die halbfertige Zeichnung des
              einen Reviers über der Karte des nächsten. */}
          <Revierkarte key={revier.id} grenze={grenze} punkte={punkte} revierId={revier.id} />
        </div>
      </div>
    </div>
  )
}
