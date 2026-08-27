import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geladen, vollstaendig } from '../laden'
import { Reiter } from './reiter'
import { alsSaison, kurve, streckenbuch, TERMINE, type Jagdzeile } from './strecke'
import './dokumentation.css'

/**
 * Dokumentation — vierter Bereich der Zentrale (Konzept §1.1).
 *
 * **Dieser Reiter trägt die historische Strecke je Jagdjahr** (A-C4, Quelle
 * `historische_jagden_soeder` aus Migration 110). Seit dem 27.08.2026 steht
 * daneben der Reiter *Statistik* (A-C10) mit den drei übrigen Projektionen aus
 * 110 — er ist bewusst eine eigene Seite und keine weitere Überschrift hier:
 * jede Quelle bekommt ihre eigene, weil eine Summe über zwei von ihnen falsch
 * ist.
 *
 * Die beiden anderen Unterebenen des Konzepts — Abschussplan und
 * Beobachtungen — fehlen weiterhin sichtbar statt deaktiviert dazustehen,
 * dieselbe Haltung wie beim fehlenden Bereich „Drückjagd" (§1.1). Sie stehen
 * deshalb auch NICHT als toter Reiter in der Leiste.
 *
 * **Dies ist NICHT die „Strecke zeilenweise" aus Phase 5.** §4.2 verlangt für
 * die Live-Strecke ausdrücklich Einzelzeilen statt Aggregate, weil ein Aggregat
 * seinen eigenen Hinweis nicht bedienen kann („welche Abschüsse sind offen?").
 * Diese Chronik KANN nicht zeilenweise sein: es gibt keine Einzelerlegungen von
 * 1993–2026, nur Summen je Jagd (Konzept Historische Strecken §2). Der
 * Phase-5-Screen kommt daneben, nicht statt dessen — und er liest `kills`,
 * nicht diese View.
 *
 * **Die Grenze zwischen beiden ist gemessen und scharf:** die Chronik endet mit
 * Saison 2025/26 (31.01.2026), die erste Live-Erlegung der Datenbank ist der
 * 19.05.2026, und **0 von 22** liegen in Söder. Es gibt keine Saison, in der
 * beide etwas beitragen.
 *
 * **Chronik und `kills` dürfen deshalb sehr wohl nebeneinander in eine Reihe —
 * das Doppelzähl-Verbot gilt zwischen den vier Chronik-Quellen, nicht hier.**
 * Konzept §6 nennt für „Strecke je Jagdjahr" ausdrücklich `jagden_soeder` +
 * `kills` je Saison. Was die beiden trennt, ist nicht Überlappung, sondern
 * Auflösung: die Chronik summiert je Termin und kennt weder Wildart noch Tag
 * noch Erleger, eine gemeldete Erlegung kennt alle drei und dafür keinen
 * Termin. Eine Zeile „2026/27" in dieser Kreuztabelle bräuchte die Spalte
 * „Dez. früh", die keine App-Meldung füllen kann. Der Anschluss wird deshalb
 * ein eigener Abschnitt unter derselben Überschrift, mit sichtbarer Naht —
 * fällig mit der ersten Erlegung in Söder (Moritz, 07.08.2026).
 */

type Revier = { id: string; name: string }

const ZAHL = new Intl.NumberFormat('de-DE')

export default async function DokumentationPage({
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

  // Die Revier-ID gehört in die URL (§1.2) — kanonische Adresse wie überall
  // sonst, damit der Wechsler der Seitenleiste weiterträgt.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/dokumentation?revier=${reviere[0].id}`)

  // Gelesen wird die VIEW, nie die Tabelle `historische_strecken` — der
  // `quelle`-Filter steckt dort fest verdrahtet (Begründung im Kopf von
  // `strecke.ts`).
  //
  // **`.eq('district_id', …)` ist nicht redundant zu RLS.** Die Policy filtert
  // auf `besitzer_id = auth.uid()`, also auf den Menschen, nicht auf das
  // Revier; ohne diese Bedingung zeigte der Screen bei jedem gewählten Revier
  // dieselbe Söder-Chronik. Dieselbe Rolle wie `.eq('district_id', revierId)`
  // in den Objekt-Writes seit R3 aufgehoben wurde.
  //
  // **`count: 'exact'` und `vollstaendig()` sind der Riegel gegen eine stille
  // Abschneidung.** Heute sind es 124 Zeilen — eine zu kleine Zahl in einem
  // Streckenbuch liest sich wie eine Auskunft.
  const zeilen = vollstaendig<Jagdzeile>(
    await supabase
      .from('historische_jagden_soeder')
      .select('jagdjahr, termin, anzahl', { count: 'exact' })
      .eq('district_id', revier.id),
    'Historische Strecke',
  )

  const buch = streckenbuch(zeilen)
  const linie = buch && kurve(buch.saisons, 720, 180)

  return (
    <div className="zentrale-wrap">
      <p className="zentrale-revier">
        <span className="zentrale-revier-label">Revier</span>
        <span className="zentrale-revier-name">{revier.name}</span>
      </p>
      <h1>Dokumentation</h1>
      <Reiter aktiv="strecke" revier={revier.id} />

      <div className="zentrale-block">
        <h2>Strecke je Jagdjahr</h2>

        {/* Kein leeres Gerüst, wenn nichts da ist: eine Tabelle mit 33 leeren
            Zeilen behauptete 33 erfolglose Saisons. Für jedes Revier ausser
            Söder ist das heute der Normalfall. */}
        {/* **Die Leer-Auskunft hängt allein an `buch`, nicht auch an `linie`.**
            Eine Chronik mit einer einzigen Saison hat keine Kurve (dort fehlt
            das Liniensegment), sehr wohl aber eine Tabelle — beides zusammen
            abzufragen hätte diesen Fall als „keine Strecke hinterlegt"
            ausgegeben, obwohl Zeilen da sind (Fremdprüfung 07.08.2026, P5).

            **Falsch-leer bleibt trotzdem möglich, und das ist heute
            unerreichbar statt gelöst** (P4): die Views filtern auf
            `besitzer_id = auth.uid()`, die Revierauswahl auf
            `districts.owner_id`. Fallen beide auseinander — ein Revier, dessen
            Chronik jemand anderem gehört —, liest sich vorhandene Historie als
            „nicht hinterlegt". Gemessen am 07.08.2026: bei Söder sind beide
            derselbe Mensch, und `kontakt_mitfuehrende` hat 0 Zeilen. Derselbe
            Fall wie im Gäste-Inspektor, Backlog D. */}
        {!buch ? (
          <p className="zentrale-leer">
            Für dieses Revier ist keine historische Strecke hinterlegt. Die
            Chronik stammt aus den Streckenbüchern des Reviers und wird nicht in
            der App erfasst.
          </p>
        ) : (
          <>
            <p className="dok-meta">
              {buch.saisons.length} Jagdjahre · {alsSaison(buch.vonJahr)} bis{' '}
              {alsSaison(buch.bisJahr)} · {ZAHL.format(buch.gemeldet)} gemeldete
              Jagden · <strong>{ZAHL.format(buch.gesamt)} Stück</strong>
            </p>

            {/* Eine einzige Akzentlinie, keine Fläche, keine Gitter, keine
                Kategorienfarben — das Portal hat genau eine Akzentfarbe, und
                der Anti-Kitsch-Guard („Streckenbuch, kein Dashboard") gilt
                weiter. Die Kurve zeigt den Verlauf, verbindlich ist die
                Tabelle darunter.

                `preserveAspectRatio="none"` streckt die Linie auf die volle
                Breite; die Punkte tragen keine Beschriftung, die verzerren
                könnte. Die drei Achsenwerte stehen als Text daneben, nicht im
                SVG — so bleiben sie lesbar und kopierbar. */}
            {linie && (
            <figure className="dok-kurve">
              <svg
                viewBox="-2 -2 724 184"
                preserveAspectRatio="none"
                role="img"
                aria-label={
                  `Strecke je Jagdjahr von ${alsSaison(buch.vonJahr)} bis ${alsSaison(buch.bisJahr)}. ` +
                  `Stärkste Saison ${alsSaison(linie.hochJahr)} mit ${linie.hoch} Stück, ` +
                  `schwächste ${alsSaison(linie.schwachJahr)} mit ${linie.schwach}. ` +
                  `Die Zahlen aller Saisons stehen in der Tabelle darunter.`
                }
              >
                <polyline points={linie.punkte} />
              </svg>
              <figcaption className="dok-achse">
                <span>{alsSaison(buch.vonJahr)}</span>
                <span className="dok-achse-mitte">
                  Höchste Strecke {linie.hoch} ({alsSaison(linie.hochJahr)}) ·
                  niedrigste {linie.schwach} ({alsSaison(linie.schwachJahr)})
                </span>
                <span>{alsSaison(buch.bisJahr)}</span>
              </figcaption>
            </figure>
            )}

            {/* Der Scroller sitzt am Wrapper, NICHT an der Tabelle. `display:
                block` auf einem `<table>` nimmt ihm seine Tabellen-Formatierungs-
                box: `width: 100%` und der kollabierte Rahmen gelten dann für den
                äußeren Block, während die Zeilengruppen eine anonyme innere
                Tabelle mit automatischer Breite bilden — das Raster füllte den
                Rahmen nicht mehr zuverlässig, und die rechte Trennlinie der
                feststehenden Spalte wurde unstet (Fremdprüfung 07.08.2026, Q3). */}
            <div className="dok-scroller">
            <table className="zentrale-tabelle dok-buch">
              <caption className="dok-legende">
                <span aria-hidden="true">—</span> kein Termin gemeldet. Die
                Chronik kennt keine Jagd ohne Strecke: eine leere Zelle heisst
                also keine Jagd, nicht null Stück.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Jagdjahr</th>
                  {buch.spalten.map((s) => (
                    <th key={s.schluessel} scope="col" className="dok-zahl">
                      {s.label}
                    </th>
                  ))}
                  <th scope="col" className="dok-zahl dok-summe">
                    Summe
                  </th>
                </tr>
                {/* Zweite Kopfzeile: in wie vielen Saisons der Termin überhaupt
                    vorkommt. Ohne sie ist eine Spalte mit einem einzigen Wert
                    (Nov. spät, 1995/96) ein Rätsel — mit ihr eine Auskunft. */}
                <tr className="dok-belegung">
                  <th scope="col">belegt in</th>
                  {buch.spalten.map((s) => (
                    <th key={s.schluessel} scope="col" className="dok-zahl">
                      {s.belegt}×
                    </th>
                  ))}
                  <th scope="col" className="dok-zahl dok-summe">
                    {buch.saisons.length}×
                  </th>
                </tr>
              </thead>
              <tbody>
                {buch.saisons.map((saison) => (
                  <tr key={saison.jahr}>
                    <th scope="row">{alsSaison(saison.jahr)}</th>
                    {saison.zellen.map((wert, i) => (
                      <td key={TERMINE[i].schluessel} className="dok-zahl">
                        {/* Kein `aria-label` je Zelle: das wiederholte
                            „kein Termin gemeldet" bei 107 von 231 Zellen wäre
                            im Vorlesefluss Lärm. Die <caption> erklärt den
                            Strich einmal für die ganze Tabelle. */}
                        {wert === null ? <span className="dok-leer">—</span> : wert}
                      </td>
                    ))}
                    <td className="dok-zahl dok-summe">{saison.summe}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Gesamt</th>
                  {/* Eine nie belegte Spalte bekommt auch im Fuß den Strich,
                      keine 0 — sonst widerspräche die Summenzeile genau der
                      Regel, die die Legende darunter aufstellt (Fremdprüfung
                      07.08.2026, P3). Bei Söder sind alle sieben belegt; der
                      Fall entsteht mit dem ersten Revier, dessen Chronik nur
                      einen Termin kennt. */}
                  {buch.spalten.map((s) => (
                    <td key={s.schluessel} className="dok-zahl">
                      {s.belegt === 0 ? <span className="dok-leer">—</span> : ZAHL.format(s.summe)}
                    </td>
                  ))}
                  <td className="dok-zahl dok-summe">{ZAHL.format(buch.gesamt)}</td>
                </tr>
              </tfoot>
            </table>
            </div>

            {/* Zwei Fussnoten, die an jede Reihe über 33 Jahre gehören. Beide
                stehen unter der Tabelle statt darüber: sie schränken das
                Gelesene ein, sie kündigen es nicht an. */}
            <div className="zentrale-note">
              <p style={{ margin: '0 0 8px' }}>
                <strong>Die Reihe vergleicht keine gleichbleibende Fläche.</strong>{' '}
                Das Revier ist über den Zeitraum gewachsen — die Streckenbücher
                nennen ab 2013 <em>100 ha Netter Wald voll integriert</em>, davor
                wechselnde Zuschnitte. Eine Saison mit mehr Strecke hatte
                möglicherweise mehr Revier.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Die Chronik endet mit {alsSaison(buch.bisJahr)}.</strong> Sie
                stammt aus den Streckenbüchern. Was ab dann in der App gemeldet
                wird, gehört genauso zum Revier und bekommt hier seinen eigenen
                Abschnitt, sobald die erste Erlegung vorliegt — nicht eine weitere
                Zeile in dieser Tabelle: eine gemeldete Erlegung kennt ihre
                Wildart und ihren Tag, aber keinen Jagdtermin, und die Chronik
                kennt es umgekehrt.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
