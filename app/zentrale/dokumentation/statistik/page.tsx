import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geladen, vollstaendig } from '../../laden'
import { Reiter } from '../reiter'
import { artAusgeschrieben } from '../../gaeste/kontakte'
import { alsSaison } from '../strecke'
import {
  anteil,
  blaetter,
  blattkurve,
  jahrestabelle,
  journal,
  OHNE_NAMEN,
  rangliste,
  verteilung,
  type Art,
  type Blatt,
  type Chronikzeile,
  type Journalzeile,
  type Reihe,
} from '../statistik'
import '../dokumentation.css'

/**
 * Statistik — der zweite Reiter der Dokumentation (A-C10).
 *
 * ## Eine Überschrift, eine Quelle
 *
 * Diese Seite kann an genau einer Sache scheitern: dass zwei Zahlen aus
 * verschiedenen Projektionen nebeneinander stehen und der Leser sie addiert.
 * `historische_strecken` trägt 1188 Zeilen in vier `quelle`-Werten, und die
 * sind **vier Sichten auf denselben Bestand** — quer summiert 11136 statt
 * 4646. Deshalb hat jeder Block hier genau eine Quelle, nennt sie unter seiner
 * Überschrift, und nirgends steht eine gemeinsame Summe.
 *
 * Gelesen wird ausschliesslich über die **Views** aus 110, nie über die
 * Tabelle: dort steckt der `quelle`-Filter fest verdrahtet, damit ihn niemand
 * vergessen kann.
 *
 * ## Zwei der drei Blöcke hängen NICHT an diesem Revier
 *
 * Und das ist keine Nachlässigkeit, sondern die Bauform der Quellen:
 * `familie_jahr` hat `district_id` per CHECK auf NULL („alle Reviere"), und
 * bei `journal_msl` sind 54 der 56 Orte gar keine Reviere dieser Datenbank.
 * Ein `.eq('district_id', …)` gäbe dort **null Zeilen**, nicht eine gefilterte
 * Auswahl.
 *
 * Die Chronik hängt am **Besitzer** (`besitzer_id = auth.uid()`), nicht am
 * Revier — derselbe Punkt, den die Strecke-Seite in ihrem Kommentar zu P4
 * schon macht. Die beiden Blöcke tragen das deshalb sichtbar im Kopf, statt
 * sich an einen Revierwechsler zu hängen, der sie nicht bewegt.
 *
 * ## Live-Erlegungen stehen hier NICHT
 *
 * Gemessen am 27.08.2026: von 22 Erlegungen ist **keine einzige** einem Revier
 * zuzuordnen — `kills.district_id` 0/22, über `hunt_id → hunts.district_id`
 * 0/22 (alle tragenden Jagden haben NULL), räumlich gegen beide Reviergrenzen
 * 0/22. Ein Live-Block zeigte hier also entweder nichts oder Zahlen ohne
 * Revierbezug unter einer Revier-Überschrift. Er kommt mit der ersten Erlegung
 * in Söder (A-C9) und bekommt dann seine eigene Naht — keine weitere Zeile in
 * einer dieser Tabellen.
 */

type Revier = { id: string; name: string }

const ZAHL = new Intl.NumberFormat('de-DE')

/** Breite und Höhe **jeder** Kurve dieser Seite im viewBox-Raster — die der
 *  Personen-Blätter wie die des Journals. */
const KURVE_B = 720
const KURVE_H = 110

export default async function StatistikPage({
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
        <h1>Dokumentation</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
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
    'Reviere',
  )

  if (reviere.length === 0) {
    return (
      <div className="zentrale-wrap">
        <h1>Dokumentation</h1>
        <p className="zentrale-sub">Kein sichtbares Revier</p>
        <p className="zentrale-leer">
          Aufzeichnungen hängen an einem Revier. Reviere anlegen und einblenden
          geht im Du-Tab der Feld-App.
        </p>
      </div>
    )
  }

  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/dokumentation/statistik?revier=${reviere[0].id}`)

  // **Nur die Rangliste wird auf das Revier eingeschränkt.** Bei den beiden
  // anderen Quellen wäre dieselbe Bedingung kein Filter, sondern ein Riegel:
  // `familie_jahr` hat `district_id` per CHECK auf NULL, und im Journal
  // liegen 54 der 56 Orte ausserhalb dieser Datenbank. Siehe Kopf.
  //
  // `count: 'exact'` und `vollstaendig()` sind der Riegel gegen eine stille
  // Abschneidung — eine zu kleine Zahl in einem Streckenbuch liest sich wie
  // eine Auskunft.
  const [rangZeilen, familieZeilen, journalZeilen] = await Promise.all([
    supabase
      .from('historische_rangliste_soeder')
      .select('kontakt_id, erleger_name, art_text, jagdjahr, anzahl', { count: 'exact' })
      .eq('district_id', revier.id),
    supabase
      .from('historische_familie_jahr')
      .select('kontakt_id, erleger_name, art_text, jagdjahr, anzahl', { count: 'exact' }),
    supabase
      .from('historische_journal_msl')
      .select('erlegt_am, ort_text, art_text, anzahl', { count: 'exact' }),
  ])

  const liste = rangliste(vollstaendig<Chronikzeile>(rangZeilen, 'Rangliste'))
  const personen = blaetter(vollstaendig<Chronikzeile>(familieZeilen, 'Familienstrecken'))
  const buch = journal(vollstaendig<Journalzeile>(journalZeilen, 'Journal'))

  const klassen = verteilung(liste).filter((k) => k.personen > 0)

  return (
    <div className="zentrale-wrap">
      <p className="zentrale-revier">
        <span className="zentrale-revier-label">Revier</span>
        <span className="zentrale-revier-name">{revier.name}</span>
      </p>
      <h1>Dokumentation</h1>
      <Reiter aktiv="statistik" revier={revier.id} />

      {/* --- Block 1: die Rangliste ---------------------------------------- */}

      <div className="zentrale-block">
        <h2>Wer hat wie viel</h2>
        <p className="dok-quelle">
          Lebenssummen aus dem Streckenbuch dieses Reviers. Diese Quelle kennt
          <strong> kein Jahr</strong> — sie sagt, wer wie viel erlegt hat, nicht wann.
        </p>

        {liste.zeilen.length === 0 ? (
          <p className="zentrale-leer">
            Für dieses Revier ist keine Rangliste hinterlegt. Sie stammt aus den
            Streckenbüchern des Reviers und wird nicht in der App erfasst.
          </p>
        ) : (
          <>
            <p className="dok-meta">
              {ZAHL.format(liste.zeilen.length)} Einträge ·{' '}
              <strong>{ZAHL.format(liste.gesamt)} Stück</strong>
            </p>

            {/* Die Verteilung steht ÜBER der Liste, weil 213 Zeilen ihre eigene
                Form nicht zeigen: acht Namen tragen mehr als ein Drittel, 32
                stehen mit genau einem Stück da. Ohne diese Zeile liest man von
                oben und hält die ersten zehn für „die Jäger dieses Reviers". */}
            <ul className="dok-klassen">
              {klassen.map((k) => (
                <li key={k.label}>
                  <span className="dok-klassen-zahl">{k.personen}</span>
                  <span className="dok-klassen-label">
                    {k.personen === 1 ? 'Eintrag' : 'Einträge'} {k.label}
                  </span>
                  <span className="dok-klassen-summe">{ZAHL.format(k.stueck)} Stück</span>
                </li>
              ))}
            </ul>

            <div className="dok-scroller">
              <table className="zentrale-tabelle dok-rang">
                <caption className="dok-legende">
                  Angezeigt wird der Name des Papiers, nicht der des Kontakts:
                  das Blatt unterscheidet Generationen durch einen Zusatz
                  („…&nbsp;jun.&ldquo;, ein Ort, eine Amtszeit), zwei Kontakte können
                  denselben Namen tragen.
                  {liste.ohneKontakt > 0 && (
                    <>
                      {' '}
                      <strong>
                        {liste.ohneKontakt}{' '}
                        {liste.ohneKontakt === 1 ? 'Eintrag ist' : 'Einträge sind'} keine
                        Person{liste.ohneKontakt === 1 ? '' : 'en'}
                      </strong>{' '}
                      (Hunde, Fallwild, Treiber und Sammelzeilen des Papiers) — sie
                      gehören zur Revierstrecke und stehen deshalb mit in der Liste.
                    </>
                  )}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="dok-rang-nr">
                      #
                    </th>
                    <th scope="col">Name</th>
                    {liste.spalten.map((s) => (
                      <th key={s.art} scope="col" className="dok-zahl">
                        {artAusgeschrieben(s.art)}
                      </th>
                    ))}
                    <th scope="col" className="dok-zahl dok-summe">
                      Summe
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {liste.zeilen.map((z, i) => (
                    <tr key={z.schluessel} className={z.kontaktId ? undefined : 'dok-kollektiv'}>
                      <td className="dok-rang-nr">{i + 1}</td>
                      {/* Eine Zeile ohne jede Namensangabe bekommt eine
                          Beschriftung statt einer leeren Zelle: sie zählt zur
                          Revierstrecke und darf deshalb nicht wie ein
                          Anzeigefehler aussehen (Fremdprüfung 27.08.2026, A1). */}
                      <th scope="row">
                        {z.papiername || <span className="dok-leer">{OHNE_NAMEN}</span>}
                      </th>
                      {liste.spalten.map((s) => {
                        const wert = z.arten.find((a) => a.art === s.art)
                        return (
                          <td key={s.art} className="dok-zahl">
                            {/* Kein `?? 0`: `anzahl > 0` ist CHECK in 110, eine
                                fehlende Art heisst „nicht verzeichnet", nicht
                                „null Stück" — dieselbe Regel wie in der
                                Kreuztabelle nebenan. */}
                            {wert ? ZAHL.format(wert.anzahl) : <span className="dok-leer">—</span>}
                          </td>
                        )
                      })}
                      <td className="dok-zahl dok-summe">{ZAHL.format(z.gesamt)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="dok-rang-nr" />
                    <th scope="row">Gesamt</th>
                    {/* Die Spaltensumme kommt aus `rangliste()`, wo sie beim
                        Gruppieren ohnehin anfällt — hier über alle Zeilen
                        nachzurechnen wäre derselbe Wert auf einem zweiten Weg
                        (Ponytail 27.08.2026). */}
                    {liste.spalten.map((s) => (
                      <td key={s.art} className="dok-zahl">
                        {ZAHL.format(s.anzahl)}
                      </td>
                    ))}
                    <td className="dok-zahl dok-summe">{ZAHL.format(liste.gesamt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* --- Block 2: die Familie ------------------------------------------ */}

      {personen.length > 0 && (
        <div className="zentrale-block">
          <h2>Die Familie über die Jahre</h2>
          <p className="dok-quelle">
            <strong>Diese Aufzeichnung hängt an dir, nicht an diesem Revier.</strong>{' '}
            Sie zählt alle Reviere zusammen — die Zahlen unten sind deshalb
            grösser als der Anteil, der oben in der Rangliste steht, und mit ihr
            nicht verrechenbar.
          </p>

          {personen.map((p) => (
            <Personenblatt key={p.schluessel} blatt={p} />
          ))}

          {/* Was getrennte Blätter NICHT können: zwei Personen in EINEM Jahr
              vergleichen. Und der Ort, an dem die Jahreswerte als Zahl stehen —
              aus der Kurve liest man sie nicht ab, ein Vorlesegerät gar nicht.
              Dieselbe Rollenteilung wie auf der Strecke-Seite nebenan. */}
          <Jahrestabelle
            reihen={personen}
            spalten={personen.map((p) => p.papiername || OHNE_NAMEN)}
          />

          {/* Die Fussnote aus A-C7 — sie steht an der Kurve nebenan seit dem
              07.08.2026 und fehlte hier (Fremdprüfung 27.08.2026, B5).
              **Sie wiegt hier sogar schwerer als dort:** die Strecke-Seite
              vergleicht ein Revier mit sich selbst, diese Reihe zählt über
              alle Reviere, in denen jemand über fünfzig Jahre unterwegs war —
              der Zuschnitt ist dort nicht nur gewachsen, er ist ein anderer. */}
          <div className="zentrale-note">
            <p style={{ margin: 0 }}>
              <strong>Diese Reihen vergleichen keine gleichbleibende Fläche.</strong>{' '}
              Sie zählen über alle Reviere, in denen jemand gejagt hat, und über
              Jahrzehnte, in denen sich Zuschnitt und Gelegenheit geändert haben.
              Ein stärkeres Jahr hatte möglicherweise mehr Revier oder mehr
              Einladungen, nicht mehr Wild.
            </p>
          </div>
        </div>
      )}

      {/* --- Block 3: das Journal ------------------------------------------ */}

      {buch && (
        <div className="zentrale-block">
          <h2>Das Journal</h2>
          <p className="dok-quelle">
            <strong>Auch diese Aufzeichnung hängt an dir, nicht an diesem Revier.</strong>{' '}
            Sie ist tagesgenau geführt und reicht über {buch.orteBenannt}{' '}
            Ortsangaben — die meisten davon sind keine Reviere dieser Datenbank. Was hier für
            dieses Revier steht, steht oben in der Rangliste noch einmal:
            dieselben Stücke, andere Sicht. <strong>Ortsangaben bleiben in der
            Schreibweise des Journals getrennt</strong> — derselbe Ort kann
            deshalb zweimal auftauchen.
          </p>

          <p className="dok-meta">
            {alsSaison(buch.vonJahr)} bis {alsSaison(buch.bisJahr)} ·{' '}
            {buch.jahre.length} belegte Jagdjahre ·{' '}
            <strong>{ZAHL.format(buch.gesamt)} Stück</strong> · stärkste Saison{' '}
            {alsSaison(buch.starkJahr)} mit {buch.starkSumme}
          </p>

          <Jahreskurve
            reihe={buch}
            beschreibung={
              `Das Journal je Jagdjahr von ${alsSaison(buch.vonJahr)} bis ${alsSaison(buch.bisJahr)}. ` +
              `Stärkste Saison ${alsSaison(buch.starkJahr)} mit ${buch.starkSumme} Stück. ` +
              `Die Zahlen stehen in den Registern darunter.`
            }
          />

          <div className="dok-register-paar">
            <Register
              titel="Nach Art"
              eintraege={buch.arten}
              gesamt={buch.gesamt}
              gruppe="journal-art"
            />
            {/* **„Nach Ortsangabe", nicht „Nach Ort"** — der Unterschied wird
                durch das Aufklappen erst scharf. Ein anklickbarer Eintrag
                wirkt wie eine verlässliche Entität; „Arten in Honingham
                Thorpe" klingt nach einer Aussage über den Ort, ist aber eine
                über EINE SCHREIBWEISE. Derselbe Ort steht hier zweimal
                (278 gegen 62 Stück, CP-88), weil `ort_text` wortgetreu das
                Papier trägt. Die Oberfläche darf das weder heimlich
                zusammenlegen noch geografische Genauigkeit behaupten, die die
                Quelle nicht hat (Codex-Designlauf 28.08.2026). */}
            <Register
              titel="Nach Ortsangabe"
              eintraege={buch.orte}
              gesamt={buch.gesamt}
              gruppe="journal-ort"
            />
          </div>

          <Jahrestabelle reihen={[buch]} spalten={['Stück']} />

          {/* Dieselbe Einschränkung, dritte Ausprägung: hier ist es nicht ein
              wachsendes Revier und nicht eine Familie über Generationen,
              sondern ein einzelner Mensch an wechselnden Orten. */}
          <div className="zentrale-note">
            <p style={{ margin: 0 }}>
              <strong>Auch diese Reihe vergleicht keine gleichbleibende Fläche.</strong>{' '}
              Sie folgt einem Menschen über {buch.orteBenannt} Ortsangaben und{' '}
              {buch.bisJahr - buch.vonJahr + 1} Jahre. Was sie zeigt, ist,
              wo und wann jemand unterwegs war — nicht, wie viel Wild es gab.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Ein Blatt je Person — Kopfzeile, Kurve (oder Register), Artenübersicht.
 *
 * **Getrennte Blätter statt vier Linien in einem Diagramm.** Die vier Reihen
 * umfassen 52, 21, 8 und 5 belegte Jahre und 1368, 460, 40 und 7 Stück; auf
 * einer gemeinsamen Achse wären drei von vieren eine Linie am Boden. Dazu
 * käme der Zwang zu vier unterscheidbaren Farben — das Portal hat genau eine
 * Akzentfarbe, und `--z-mangel` wie `--z-gesperrt` tragen bereits Bedeutung
 * (Wartungszustand, Nachsuche/Gefahr, Konzept §2.6). Vier Blätter brauchen
 * keine.
 */
function Personenblatt({ blatt }: { blatt: Blatt }) {
  return (
    <section className="dok-blatt">
      {/* Wie in der Rangliste: ein Blatt ohne Namensangabe bekommt eine
          Beschriftung statt einer leeren Überschrift. `familie_jahr` verlangt
          per CHECK ebenfalls nur `erleger_name IS NOT NULL`, ein leerer String
          genügt — heute unerreichbar (vier benannte Personen), aber es ist
          dieselbe Klasse, gegen die `identitaet()` schreibt (Schlusslesung
          27.08.2026, F2). */}
      <h3>{blatt.papiername || OHNE_NAMEN}</h3>
      <p className="dok-meta">
        {alsSaison(blatt.vonJahr)} bis {alsSaison(blatt.bisJahr)} ·{' '}
        {blatt.jahre.length} belegte Jagdjahre ·{' '}
        <strong>{ZAHL.format(blatt.gesamt)} Stück</strong> · stärkste Saison{' '}
        {alsSaison(blatt.starkJahr)} mit {blatt.starkSumme}
      </p>

      <Jahreskurve
        reihe={blatt}
        beschreibung={
          `Strecke je Jagdjahr von ${alsSaison(blatt.vonJahr)} bis ${alsSaison(blatt.bisJahr)}. ` +
          `Stärkste Saison ${alsSaison(blatt.starkJahr)} mit ${blatt.starkSumme} Stück. ` +
          `Die Zahlen stehen im Register darunter.`
        }
      />

      <Register titel="Nach Art" eintraege={blatt.arten} gesamt={blatt.gesamt} />
    </section>
  )
}

/**
 * Die Kurve einer Jahresreihe — oder das Register, wenn keine Kurve ehrlich
 * ist.
 *
 * **Ein Zug je zusammenhängendem Lauf.** Eine durchgezogene Linie über eine
 * Lücke behauptete Zwischenwerte für Jahre, über die die Chronik nichts sagt;
 * eine, die die Lücke auf die Nulllinie zöge, behauptete ein erfolgloses Jahr.
 * `anzahl > 0` ist CHECK in 110 — es gibt keine Null-Zeilen, also auch keine
 * belegte Null.
 *
 * **Skaliert wird von null bis zum stärksten Jahr DIESER Reihe**, nicht ab
 * ihrem Minimum (anders als `kurve()` in `strecke.ts`). Der Maßstab steht als
 * Text daneben, weil vier Blätter untereinander sonst gleich stark aussähen.
 */
function Jahreskurve({ reihe, beschreibung }: { reihe: Reihe; beschreibung: string }) {
  const kurve = blattkurve(reihe, KURVE_B, KURVE_H)

  if (!kurve) {
    // Zu dünn für eine Linie: die Jahre einzeln, damit sichtbar bleibt, dass
    // es Ereignisse sind und kein Verlauf.
    return (
      <ul className="dok-ereignisse">
        {reihe.jahre.map((j) => (
          <li key={j.jahr}>
            <span className="dok-ereignis-jahr">{alsSaison(j.jahr)}</span>
            <span className="dok-ereignis-zahl">{j.summe}</span>
            <span className="dok-ereignis-arten">
              {j.arten.map((a) => `${a.anzahl}× ${a.art}`).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  // **Ein Lauf je Zug plus die einzeln stehenden Jahre — das sind alle
  // Läufe.** Ein zweiter `segmente()`-Aufruf wäre dieselbe Rechnung ein
  // zweites Mal (Ponytail 27.08.2026).
  const luecken = kurve.zuege.length + kurve.einzelne.length - 1

  // **Die Struktur der Kurve gehört ins `aria-label`, nicht nur in die
  // Bildunterschrift** (Fremdprüfung 27.08.2026, B6): Unterbrechungen und
  // einzeln stehende Jahre sind genau das, was ein Sehender an der Linie
  // erkennt und ein Hörender sonst nicht erführe. Die Bildunterschrift steht
  // ausserhalb des `role="img"` und wird deshalb nicht mit vorgelesen.
  const struktur = [
    luecken === 1
      ? 'Die Linie ist einmal unterbrochen'
      : luecken > 1
        ? `Die Linie ist ${luecken}-mal unterbrochen`
        : '',
    kurve.einzelne.length === 1
      ? 'ein Jagdjahr steht allein zwischen Lücken und ist als Punkt gezeichnet'
      : kurve.einzelne.length > 1
        ? `${kurve.einzelne.length} Jagdjahre stehen allein zwischen Lücken und sind als Punkte gezeichnet`
        : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <figure className="dok-kurve dok-kurve-klein">
      <svg
        viewBox={`-2 -2 ${KURVE_B + 4} ${KURVE_H + 4}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          struktur
            ? `${beschreibung} ${struktur} — dort nennt die Chronik keine Strecke.`
            : beschreibung
        }
      >
        {kurve.zuege.map((punkte, i) => (
          <polyline key={i} points={punkte} />
        ))}
        {/* Ein Jahr, das allein zwischen Lücken steht, hat kein Segment und
            verschwände als `<polyline>` lautlos — die Achse nennte es
            trotzdem weiter als Anfang der Reihe. Es bekommt einen Punkt.
            `r` in Nutzereinheiten wäre durch `preserveAspectRatio="none"`
            horizontal mitverzerrt; deshalb sitzt die Größe als Strichstärke
            an einem Nullsegment mit `non-scaling-stroke`. */}
        {kurve.einzelne.map((punkt) => (
          <polyline key={punkt} className="dok-punkt" points={`${punkt} ${punkt}`} />
        ))}
      </svg>
      <figcaption className="dok-achse">
        <span>{alsSaison(reihe.vonJahr)}</span>
        <span className="dok-achse-mitte">
          Höchster Wert {reihe.starkSumme}
          {luecken > 0 && (
            <>
              {' · '}
              {luecken === 1 ? 'eine Unterbrechung' : `${luecken} Unterbrechungen`}: dort
              nennt die Chronik keine Strecke
            </>
          )}
        </span>
        <span>{alsSaison(reihe.bisJahr)}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Die Jahreswerte als Tabelle — ein Jahr je Zeile, eine Reihe je Spalte.
 *
 * **Auch die leeren Jahre bekommen eine Zeile**, und ihre Zellen tragen einen
 * Strich statt einer Null: `anzahl > 0` ist CHECK in 110, ein Jahr ohne
 * Eintrag heisst „keine Strecke verzeichnet", nicht „nichts erlegt". Ohne die
 * leeren Zeilen fiele zudem nicht auf, wo eine Reihe aussetzt — genau das,
 * was die Kurve durch ihre Unterbrechung zeigt.
 */
function Jahrestabelle({
  reihen,
  spalten,
}: {
  reihen: readonly Reihe[]
  spalten: readonly string[]
}) {
  const tabelle = jahrestabelle(reihen)
  if (!tabelle) return null

  return (
    <div className="dok-scroller">
      <table className="zentrale-tabelle dok-jahre">
        <caption className="dok-legende">
          <span aria-hidden="true">—</span> in diesem Jagdjahr ist keine Strecke
          verzeichnet. Das heisst nicht null Stück: die Chronik führt keine Zeile
          ohne Strecke, ein Strich kann also ebenso gut heissen, dass jemand nicht
          dabei war.
        </caption>
        <thead>
          <tr>
            <th scope="col">Jagdjahr</th>
            {spalten.map((s) => (
              <th key={s} scope="col" className="dok-zahl">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabelle.zeilen.map((z) => (
            <tr key={z.jahr}>
              <th scope="row">{alsSaison(z.jahr)}</th>
              {z.zellen.map((wert, i) => (
                <td key={spalten[i]} className="dok-zahl">
                  {wert === null ? <span className="dok-leer">—</span> : ZAHL.format(wert)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Gesamt</th>
            {tabelle.summen.map((summe, i) => (
              <td key={spalten[i]} className="dok-zahl dok-summe">
                {ZAHL.format(summe)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * Eine nüchterne Liste Art/Ortsangabe mit Menge und Anteil — aufklappbar,
 * wo es etwas aufzuklappen gibt.
 *
 * **Der Aufklapper ist natives `<details>`, kein Client-State und kein
 * URL-Parameter.** Die Seite bleibt damit eine Server Component und die
 * Interaktion funktioniert ohne JavaScript. Ein Adress-Parameter wäre die
 * konzeptreine Lesart von „eine Unterebene gehört in die Adresse" (Konzept
 * §2.4) — aber das Aufklappen wechselt weder Quelle noch Zeitraum noch
 * Ansicht, es legt nur frei, was zu genau dieser Zeile gehört. Und jeder
 * Klick wäre ein Server-Roundtrip auf einer Seite, die 1188 Zeilen lädt.
 *
 * **`gruppe` macht die Aufklapper eines Registers gegenseitig exklusiv** —
 * natives HTML, ohne eine Zeile Skript. Die beiden Register bekommen
 * VERSCHIEDENE Gruppen, und das ist eine Entscheidung: sie stehen
 * nebeneinander, um zwei Blickwinkel gleichzeitig zu halten. Eine gemeinsame
 * Gruppe nähme genau den Vergleich weg, für den es zwei Register gibt.
 *
 * **Zeilen mit nur EINER Gegenzeile bekommen keinen Aufklapper**, sondern die
 * Antwort direkt in der Zeile. Gemessen am 28.08.2026: das betrifft 29 von 56
 * Ortsangaben und 8 von 25 Arten. Ein Klick, der eine einzige Zeile mit
 * derselben Zahl aufdeckt, ist ein leeres Versprechen — und eine Liste, in der
 * die Hälfte der Zeilen nicht reagiert, wäre schlimmer als gar kein Klick.
 */
function Register({
  titel,
  eintraege,
  gesamt,
  gruppe,
}: {
  titel: string
  eintraege: readonly { art: string; anzahl: number; gegen?: readonly Art[] }[]
  gesamt: number
  /** Ohne sie kein Aufklappen — die Register der Blätter haben keine
   *  Gegenachse und sollen keine bekommen. */
  gruppe?: string
}) {
  if (eintraege.length === 0) return null
  return (
    <div className={gruppe ? 'dok-register dok-register-klappbar' : 'dok-register'}>
      <h4>{titel}</h4>
      <ul>
        {eintraege.map((e) => {
          const gegen = gruppe ? (e.gegen ?? []) : []
          // Die Kopfzeile ist in beiden Zweigen dieselbe. Sie EINMAL zu bauen
          // ist nicht nur kürzer — zweimal geschrieben driftet sie beim
          // nächsten Eingriff auseinander, und genau diese Klasse hat an
          // dieser Seite am 27.08.2026 siebenmal zugeschlagen (Ponytail
          // 28.08.2026).
          const kopf = (
            <>
              <span className="dok-register-name">
                {artAusgeschrieben(e.art)}
                {/* Die einzige Gegenzeile steht ohne Klick da — 29 von 56
                    Ortsangaben haben nur eine (gemessen 28.08.2026). Ein
                    Aufklapper, der eine Zeile mit derselben Zahl aufdeckt,
                    ist ein leeres Versprechen. */}
                {gegen.length === 1 && (
                  <span className="dok-register-einzig">
                    {artAusgeschrieben(gegen[0].art)}
                  </span>
                )}
              </span>
              <span className="dok-register-zahl">{ZAHL.format(e.anzahl)}</span>
              {/* Der Anteil ist gerundet und steht deshalb ohne Nachkommastelle:
                  eine Prozentzahl mit Komma behauptet eine Genauigkeit, die eine
                  Papierchronik nicht hat.

                  **Unter einem halben Prozent steht „< 1 %", nicht „0 %"**
                  (Schlusslesung 27.08.2026): im Journal erreichen das 56 Orte mit
                  echten Daten, und eine 0 neben einer sichtbaren Menge liest sich
                  wie ein Rechenfehler. */}
              <span className="dok-register-anteil">{anteil(e.anzahl, gesamt)}</span>
            </>
          )
          if (gegen.length < 2) return <li key={e.art}>{kopf}</li>
          return (
            <li key={e.art} className="dok-register-auf">
              <details name={gruppe}>
                <summary>{kopf}</summary>
                {/* Im Aufklapper stehen NUR Stückzahlen, kein Prozentwert.
                    Sein Nenner wäre erklärungsbedürftig — Anteil am Journal
                    oder an dieser Zeile? Zwei Bezugsgrössen nebeneinander
                    sind genau der Fehler, gegen den diese Seite gebaut ist.
                    Was hier gilt, ist eine einzige Beziehung, und sie ist
                    nachprüfbar: diese Zahlen summieren auf die Zahl darüber
                    (Selbsttest, beide Richtungen). */}
                <ul className="dok-aufschluss">
                  {gegen.map((g) => (
                    <li key={g.art}>
                      <span className="dok-register-name">{artAusgeschrieben(g.art)}</span>
                      <span className="dok-register-zahl">{ZAHL.format(g.anzahl)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
