import { createClient } from '@/lib/supabase/server'
import { geladen } from '../../../laden'
import { typLabel } from '../../../objekte'
import {
  alsBerlinDatum,
  alsDatum,
  alsEuro,
  alsHektar,
  alsStatus,
  darfGedrucktWerden,
  effektiverStatus,
  entgeltAufDemBlatt,
  heuteUtc,
  landesrecht,
  STATUS_LABEL,
  zuteilungsArt,
} from '../../scheine'
import './druck.css'

/**
 * Das druckbare Blatt zu einem Begehungsschein.
 *
 * **Wofür es da ist, und was es ausdrücklich NICHT ist.** Nach § 19 NJagdG muss
 * ein Jagdgast bei der Jagd „einen Jagderlaubnisschein mit sich führen" oder von
 * einer jagdausübungsberechtigten Person begleitet sein. Dieses Blatt ist das
 * Papier für den ersten Fall. Es ist **kein Behördenformular** — ein amtliches
 * Muster gibt es weder im Bund noch in Niedersachsen (§ 11 Abs. 1 Satz 3 BJagdG
 * überlässt die Erteilung vollständig den Ländern), und in Niedersachsen zeigt
 * der Aussteller der Jagdbehörde gar nichts an. Vollständige Herleitung:
 * `docs/konzepte/QuickHunt_Recherche_Begehungsschein_Recht_V1.md` in
 * quickhunt-native.
 *
 * **Kein PDF-Werkzeug.** Das Blatt ist HTML mit `@media print`; der Browser
 * macht daraus ein PDF. `hunting_licenses.pdf_url` bleibt leer, wie seit
 * Migration 003 — 0 von 4 Zeilen haben sie je getragen.
 *
 * **Wer es sehen darf, entscheidet RLS, und das ist hier genau richtig.** Die
 * Policies aus 079 lassen Aussteller und Revierbesitzer lesen, die Policy
 * `hunting_licenses_holder` zusätzlich den Inhaber selbst. Der Gast kann sein
 * eigenes Blatt also drucken — und er ist der, der es nach § 19 mitführen muss.
 * Es gibt hier bewusst keine zusätzliche Prüfung: eine zweite Grenze neben RLS
 * wäre eine zweite Wahrheit.
 *
 * **Der Einladungscode steht bewusst NICHT auf dem Blatt.** Er ist ein
 * Inhaber-Token: wer ihn hat, löst den Schein ein. Ein Papier, das durch den
 * Wald getragen, im Auto liegen gelassen und einem Beamten hingehalten wird,
 * ist der falsche Ort dafür. Der Code steht in der Liste, mit Kopierknopf.
 */

type ScheinZeile = {
  id: string
  district_id: string
  issuer_id: string
  holder_name: string
  holder_jagdschein_nr: string | null
  valid_from: string
  valid_until: string
  auflagen: string | null
  zone_ids: string[] | null
  stand_ids: string[] | null
  entgeltlich: boolean | null
  entgelt_betrag: string | number | null
  entgelt_faellig: string | null
  created_at: string | null
  status: string | null
}

type RevierZeile = { name: string; bundesland: string | null; area_ha: number | null }

/** Eine Meldung im Blatt-Rahmen — damit ein Fehlschlag nicht wie ein leeres Blatt aussieht. */
function Hinweisblatt({ text }: { text: string }) {
  return (
    <div className="blatt blatt--hinweis">
      <p>{text}</p>
    </div>
  )
}

export default async function ScheinDruckSeite({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <Hinweisblatt text="Diese Seite braucht eine Anmeldung." />
  }

  // Als Liste lesen und die erste Zeile nehmen, statt `.single()`: `single()`
  // macht aus „RLS lässt dich nicht" einen Fehler, und der wäre von einem
  // echten Ladefehler nicht zu unterscheiden. So bleibt `geladen()` für den
  // Fehlerfall zuständig und die leere Liste für den Berechtigungsfall.
  const scheine = geladen<ScheinZeile[]>(
    await supabase
      .from('hunting_licenses')
      .select(
        'id, district_id, issuer_id, holder_name, holder_jagdschein_nr, valid_from, ' +
          'valid_until, auflagen, zone_ids, stand_ids, entgeltlich, entgelt_betrag, ' +
          'entgelt_faellig, created_at, status'
      )
      .eq('id', id),
    'Der Begehungsschein'
  )
  const schein = scheine[0]

  // Ein Satz für beide Fälle, und das ist Absicht: „gibt es nicht" und „gehört
  // dir nicht" auseinanderzuhalten machte die Seite zum Orakel, mit dem sich
  // die Existenz fremder Scheine durchprobieren ließe. Dieselbe Haltung wie in
  // `meine_einladungen()` (Migration 080).
  if (!schein) {
    return (
      <Hinweisblatt text="Diesen Begehungsschein gibt es nicht, oder er gehört zu keinem Revier, das du ausstellst oder besitzt." />
    )
  }

  /**
   * **Ein gesperrter Schein wird nicht gedruckt** (Codex, 05.08.2026, S5).
   *
   * Papier laesst sich nicht zurueckrufen. Wer einen Schein entzieht und den
   * Ausdruck von gestern in der Jackentasche des Gastes weiss, kann daran
   * nichts mehr aendern — aber ein HEUTE erzeugtes Blatt darf einen Zustand
   * nicht behaupten, den es nicht mehr gibt. Dieselbe Logik wie in der Liste
   * (`effektiverStatus`, Migration 077): eine Sperre schlaegt das Datum, und
   * der Text nennt den Grund statt nur „geht nicht".
   *
   * **`nochnicht` geht ausdruecklich durch, und das ist der Punkt, an dem der
   * erste Entwurf dieses Riegels falsch lag** (Schlusslesung 05.08.2026,
   * Befund 1). Er pruefte `!== 'aktiv'` und sperrte damit den HAEUFIGSTEN
   * Fall mit: einen heute fuer die kommende Saison ausgestellten Schein. Der
   * Ablauf, fuer den das Blatt gebaut ist, heisst „ausstellen, drucken, dem
   * Gast mitgeben" — die Mitfuehrpflicht aus § 19 NJagdG beginnt am ersten
   * Ansitz, nicht am Tag des Ausdrucks. Das Blatt nennt seinen
   * Gueltigkeitszeitraum selbst und behauptet nichts Gegenwaertiges.
   */
  const status = effektiverStatus(
    alsStatus(schein.status),
    schein.valid_from,
    schein.valid_until,
    heuteUtc(),
  )
  if (!darfGedrucktWerden(status)) {
    return (
      <Hinweisblatt
        text={
          `Dieser Begehungsschein ist „${STATUS_LABEL[status]}" und wird deshalb nicht als `
          + 'Blatt ausgegeben. Ein Ausdruck wuerde eine Erlaubnis behaupten, die gerade nicht '
          + 'besteht.'
        }
      />
    )
  }

  const reviere = geladen<RevierZeile[]>(
    await supabase
      .from('districts')
      .select('name, bundesland, area_ha')
      .eq('id', schein.district_id),
    'Das Revier'
  )
  const revier = reviere[0] ?? null

  /**
   * **Lieber kein Blatt als ein halbes** (Codex, 05.08.2026, S4/D2).
   *
   * `geladen()` wirft nur bei einem DB-Fehler; 0 Zeilen sind ein gueltiges
   * Ergebnis und hier der Fall „RLS laesst dich das Revier nicht sehen". Ohne
   * diesen Riegel druckte die Seite ein Blatt mit „Revier nicht lesbar" und
   * trotzdem dem Satz, ein Jagdausuebungsberechtigter erteile die Erlaubnis —
   * ein Dokument, das an der einzigen Stelle luegt, auf die es ankommt.
   */
  if (!revier) {
    return (
      <Hinweisblatt text="Das Revier zu diesem Begehungsschein ist nicht lesbar — ohne Jagdbezirk wird kein Blatt ausgegeben." />
    )
  }

  const aussteller = geladen<{ display_name: string }[]>(
    await supabase.from('profiles').select('display_name').eq('id', schein.issuer_id),
    'Der Aussteller'
  )
  const ausstellerName = aussteller[0]?.display_name?.trim() || null

  /**
   * **Ohne Aussteller kein Blatt** (Fremdpruefung 05.08.2026, S4).
   *
   * Derselbe Fall wie beim Revier eine Abfrage hoeher, und er war uebersehen:
   * `geladen()` wirft nur bei einem DB-Fehler, 0 Zeilen sind ein gueltiges
   * Ergebnis. Ohne diesen Riegel entstand das vollstaendige Dokument mit dem
   * Satz „Der Jagdausuebungsberechtigte erteilt die vorstehende … Erlaubnis"
   * — ohne dass irgendwo steht, WER das ist, und mit einer leeren
   * Unterschriftszeile darunter. Ein Papier, das eine Erlaubnis behauptet,
   * deren Urheber es nicht nennt.
   */
  if (!ausstellerName) {
    return (
      <Hinweisblatt text="Der Aussteller dieses Begehungsscheins ist nicht lesbar — ohne ihn wird kein Blatt ausgegeben." />
    )
  }

  const art = zuteilungsArt(schein.zone_ids, schein.stand_ids)
  const standIds = schein.stand_ids ?? []
  // Nur laden, wenn es etwas zu laden gibt: ein `.in('id', [])` ist eine Abfrage
  // ohne Zweck, und auf einem Blatt, das jemand druckt, zählt jede Verzögerung.
  const staende =
    art === 'staende' && standIds.length > 0
      ? geladen<{ id: string; name: string | null; type: string }[]>(
          await supabase
            .from('map_objects')
            .select('id, name, type')
            .in('id', standIds)
            // **`.eq('district_id', …)` ist der eigentliche Riegel**, nicht die
            // id-Liste (Codex, 05.08.2026, S9): `stand_ids` ist ein `uuid[]`
            // ohne Fremdschluessel, das der Aussteller frei beschreibt. Ohne
            // diese Bedingung druckte eine verirrte Objekt-ID den Namen eines
            // FREMDEN Reviers als rechtliche Zuteilung unter diesen
            // Jagdbezirk. Dieselbe Lehre wie R3 in AGENTS.md.
            .eq('district_id', schein.district_id)
            .order('name'),
          'Die Stände'
        )
      : []

  /**
   * Die Standnamen — **niemals gekürzt**.
   *
   * Die Zuteilung ist der rechtlich tragende Teil des Scheins; ein „und 7
   * weitere" wie in der Liste wäre auf dem Papier eine Erlaubnis, die ihren
   * eigenen Umfang verschweigt. Ein Stand, den die Abfrage nicht hergibt (der
   * Inhaber sieht `map_objects` nur bei gültigem Schein, 077), wird als solcher
   * ausgewiesen statt weggelassen — sonst zeigte das Blatt eine zu kleine
   * Zuteilung.
   *
   * **Der Fallback deckt zwei Faelle und unterscheidet sie bewusst nicht**
   * (Schlusslesung 05.08.2026, Befund 7): einen Stand, den RLS verbirgt, und
   * einen, den jemand geloescht hat. Fuer den ersten ist das richtig — eine
   * genauere Meldung waere ein Orakel. Fuer den zweiten ist es die
   * unauffaellige Variante, und sie ist hier die richtige: die Zeile steht in
   * `stand_ids`, also gehoert sie zur Zuteilung, egal ob das Objekt noch
   * existiert. Wer sie wegliesse, druckte eine kleinere Erlaubnis als erteilt.
   */
  const standNamen = standIds.map(
    (sid) => {
      const o = staende.find((s) => s.id === sid)
      if (!o) return 'Stand (Name nicht lesbar)'
      return o.name?.trim() || typLabel(o.type)
    }
  )

  const { hinweise, behoerde } = landesrecht(revier.bundesland, schein.entgeltlich)
  const betrag = alsEuro(schein.entgelt_betrag)
  const faellig = schein.entgelt_faellig?.trim() || null
  // Nur anbieten, wenn es etwas zu drucken GIBT — ein Haekchen ohne Wirkung
  // ist schlimmer als keins.
  const hatEntgelt = schein.entgeltlich === true && (betrag !== null || faellig !== null)
  const flaeche = alsHektar(revier.area_ha)
  // `alsBerlinDatum`, NICHT `alsDatum`: `created_at` ist ein `timestamptz`. Der
  // Schnitt am ISO-String läge einen Tag zu früh, wenn der Schein zwischen 00:00
  // und 02:00 Berliner Zeit angelegt wurde. Derselbe Fehler wie bei
  // `kontakte.inaktiv_seit` (Fremdprüfung 04.08.2026, Punkt 3).
  // `alsBerlinDatum` liefert bei Unbrauchbarem `'—'`; auf einem Rechtsdokument
  // ist ein Gedankenstrich hinter „Ausgestellt am" schlechter als gar keine
  // Angabe. (Codex, 05.08.2026, D6)
  const roh = schein.created_at ? alsBerlinDatum(schein.created_at) : '—'
  const ausgestellt = roh === '—' ? null : roh

  return (
    <>
      {/* Steht nur am Bildschirm. Die Abwahl der Kopf- und Fußzeilen ist keine
          Feinheit: sonst druckt der Browser URL, Uhrzeit und Seitenzahl auf ein
          Blatt, das einem Beamten hingehalten wird. */}
      <p className="druck-anleitung">
        Zum Drucken <kbd>Strg</kbd>+<kbd>P</kbd> (Mac: <kbd>Cmd</kbd>+<kbd>P</kbd>). Im
        Druckdialog „Kopf- und Fußzeilen“ abwählen und Ränder auf „Standard“ lassen.
      </p>

      {/* **Ohne JavaScript, und das ist keine Sparsamkeit.** Ein Häkchen, das
          die Seite neu lädt oder React-Zustand braucht, wäre im Moment des
          Druckens die unzuverlässigere Lösung — der Browser druckt den DOM, wie
          er dasteht, und `:has()` schlägt direkt darauf durch. Voreinstellung
          ist AUS: ein versehentlich mitgedruckter Preis auf einem Blatt, das
          Polizeibeamten vorgezeigt wird, ist der teurere Fehler als ein
          vergessenes Häkchen. */}
      {hatEntgelt ? (
        <p className="druck-anleitung">
          <label>
            <input type="checkbox" id="zeige-entgelt" />
            Betrag und Fälligkeit mitdrucken
          </label>
          <span>
            Ohne Häkchen ist das Blatt der Nachweis zum Mitführen (§ 19 NJagdG) — mit
            Häkchen zugleich die Vereinbarung zum Unterschreiben.
          </span>
        </p>
      ) : null}

      <div className="blatt">
        {/* Faltmarken für die Drittelung. Die einzige Verzierung des Blattes,
            und sie ist reine Mechanik: gefaltet passt es in eine Jackentasche,
            und die erste Marke sitzt so, dass der Prüfblock oberhalb liegt. */}
        <span className="falz falz-a" aria-hidden="true" />
        <span className="falz falz-b" aria-hidden="true" />

        <header>
          <h1>
            Jagderlaubnisschein <span>(Begehungsschein)</span>
          </h1>
          <p className="bedingung">
            Nur gültig zusammen mit einem gültigen, auf denselben Namen ausgestellten
            Jagdschein.
          </p>
        </header>

        <hr className="regel" />

        {/* Der Prüfblock: die drei Angaben, die auf Armlänge lesbar sein müssen.
            Der Inhaber steht am größten, weil das die Angabe ist, die gegen den
            Jagdschein in der anderen Hand gehalten wird. */}
        <section className="pruefblock">
          <p className="mark">Inhaber</p>
          <p className="inhaber">{schein.holder_name}</p>
          {schein.holder_jagdschein_nr ? (
            <p className="jsnr">
              Jagdschein-Nr. <span className="mono">{schein.holder_jagdschein_nr}</span>
            </p>
          ) : null}

          <div className="pruefzeile">
            <div>
              <p className="mark">Jagdbezirk</p>
              <p className="bezirk">
                {revier.name}
                <span className="sub">
                  {/* „Reviergröße", nicht „Fläche" — und das ist kein Wortspiel.
                      § 20 Satz 2 NJagdG verlangt vom Anzeigenden die ANTEILIG
                      entfallende Fläche, und der Anteilsschlüssel bei mehreren
                      Scheinen ist ungeklärt. Ohne dieses eine Wort läse ein
                      Stände-Schein die Zahl daneben wie seinen eigenen Umfang. */}
                  {[revier.bundesland, flaeche ? `Reviergröße ${flaeche}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </p>
            </div>
            <div>
              <p className="mark">Gültig</p>
              <p className="gueltig">
                {alsDatum(schein.valid_from)} – {alsDatum(schein.valid_until)}
              </p>
            </div>
          </div>
        </section>

        <hr className="regel" />

        {/* Der performative Kern, als Fließsatz und ohne Feldbezeichner: genau
            dadurch liest er sich als Erklärung eines Menschen und nicht als
            Datenzeile. „nicht übertragbar" ist keine Floskel, sondern § 18
            Abs. 1 NJagdG. */}
        <p className="satz">
          {`${ausstellerName} erteilt als Jagdausübungsberechtigter die vorstehende, nicht übertragbare Jagderlaubnis.`}
        </p>

        <div className="feld">
          <p className="mark">Erteilung</p>
          <div className="wert">
            <p className="entgelt">{entgeltAufDemBlatt(schein.entgeltlich)}</p>
            {schein.entgeltlich == null ? (
              <p className="streichen">Nichtzutreffendes bitte streichen</p>
            ) : null}
          </div>
        </div>

        {hatEntgelt ? (
          <div className="feld feld--entgelt">
            <p className="mark">Entgelt</p>
            <div className="wert">
              {[betrag, faellig].filter(Boolean).join(' · ')}
            </div>
          </div>
        ) : null}

        <div className="feld">
          <p className="mark">Zuteilung</p>
          <div className="wert">
            {art === 'revier' ? (
              <p>Ganzes Revier</p>
            ) : art === 'zonen' ? (
              <p>{schein.zone_ids!.length} gezeichnete Bereiche</p>
            ) : (
              <>
                <p>Einzelne Stände ({standNamen.length})</p>
                <ol className="staende">
                  {standNamen.map((n, i) => (
                    <li key={`${i}-${n}`}>{n}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>

        <div className="feld feld--auflagen">
          <p className="mark">Auflagen</p>
          {/* Anders als am Bildschirm entfällt der Abschnitt bei Leere NICHT.
              Ein Bildschirm kennt den Fehlerfall „hier wurde etwas
              abgeschnitten" nicht, ein gefaltetes Blatt in einer Jackentasche
              sehr wohl — und der Trophäenhinweis unten verweist ausdrücklich
              hierher zurück. */}
          <div className="wert">{schein.auflagen?.trim() || 'keine'}</div>
        </div>

        {hinweise.length > 0 || behoerde ? (
          <section className="recht">
            {hinweise.map((h) => (
              <p key={h.bezug}>
                <b>{h.bezug}</b> {h.text}
                {/* Der Rueckverweis ist KEIN Gesetzestext und darf nicht unter
                    derselben fetten Bezugsangabe stehen — ein Beamter laese ihn
                    sonst als Teil des Paragraphen. (Schlusslesung 05.08.2026,
                    Befund 3) */}
                {h.zusatz ? <span className="zusatz"> Anmerkung: {h.zusatz}</span> : null}
              </p>
            ))}
            {behoerde ? <p>{behoerde}</p> : null}
          </section>
        ) : null}

        {/* Am Blattfuß verankert, nicht mitfließend: dadurch sieht jeder Schein
            gleich aus, ob die Auflagen leer oder fünfzeilig sind — und die
            zweite Faltmarke kann konstruktiv nie in eine Unterschriftslinie
            fallen. */}
        <div className="unten">
          <div className="ortdatum">
            <span className="schreiblinie" />
            <p className="mark">Ort, Datum</p>
          </div>

          <div className="sig">
            <div>
              <span className="schreiblinie" />
              <p className="gedruckt">{ausstellerName}</p>
              <p className="mark">Aussteller (Jagdausübungsberechtigter)</p>
            </div>
            <div>
              <span className="schreiblinie" />
              <p className="gedruckt">{schein.holder_name}</p>
              <p className="mark">Inhaber</p>
            </div>
          </div>

          <div className="fuss">
            <span>{ausgestellt ? `Ausgestellt am ${ausgestellt}` : 'Ausgestellt'}</span>
            <span className="wortmarke">Erzeugt mit QuickHunt</span>
          </div>
        </div>
      </div>
    </>
  )
}
