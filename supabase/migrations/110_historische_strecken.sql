-- 110_historische_strecken.sql
-- Nativer Track, 06.08.2026. Setzt 085 (kontakte) und 100 (inaktiv_seit) voraus.
-- Konzept: quickhunt-native/docs/konzepte/QuickHunt_Konzept_Historische_Strecken_V1.md
--
-- WOFUER
-- ------
-- Die Chronik der Drueckjagden in Soeder, ab dem 19.02.1946: 80 Jahre,
-- 4646 Stueck, 209 namentliche Erleger. Sie liegt heute in sechs Excel-Dateien
-- von Jobst-Heinrich Lampe, die er allein pflegt, und in Jagdberichten, die
-- fuer 1968-1995 nur auf Papier existieren.
--
-- Moritz' Vorgabe vom 06.08.2026, woertlich: „je Jaeger eine Historie
-- hinterlegen. dass ich zb Christian anklicken kann und sehe ok der hat gesamt
-- soviel geschossen, in den revieren in den jahren usw."
--
-- WARUM EINE EIGENE TABELLE UND NICHT `kills` — EINE ERLEGUNG BRAUCHT EIN KONTO
-- -----------------------------------------------------------------------------
-- **Das ist der Befund, der den ganzen Entwurf traegt, und er ist an der
-- Produktion gemessen (06.08.2026).**
--
-- `kills.reporter_id` ist NOT NULL und zeigt auf `profiles(id)`. Es gibt in
-- `kills` **kein anderes Feld fuer „wer hat geschossen"**.
--
-- `participant_id` kann es nicht ersetzen, obwohl es genau danach aussieht.
-- `set_kill_herkunft()` (092) verlangt beim INSERT:
--
--     where p.id = new.participant_id
--       and p.hunt_id is not distinct from new.hunt_id
--       and p.user_id = new.reporter_id      -- <- die Zeile MUSS dem Melder gehoeren
--
-- Eine Teilnehmerzeile mit `user_id IS NULL` und gesetztem `kontakt_id` —
-- **genau die Bauform, die 106 vor fuenf Tagen angelegt hat** — kann von einer
-- Erlegung also nie referenziert werden. Die Kette
-- `kills -> hunt_participants -> kontakte` ist per Konstruktion geschlossen:
-- `participant_id` bedeutet „welche MEINER Teilnehmerzeilen", nicht „wer hat
-- geschossen".
--
-- Wer die 209 Erleger trotzdem in `kills` schriebe, muesste `reporter_id =
-- Moritz` setzen. Das waere eine Falschaussage in genau der Tabelle, aus der
-- Streckenbuch, Tagebuch und spaeter die Kontingente lesen — 3221 Zeilen, die
-- alle denselben Erleger behaupten.
--
-- **`kills.kontakt_id` nachzuruesten ist der naheliegende und der falsche
-- Weg:** es loeste ein Problem, fuer das die Daten fehlen. Es gibt **keine
-- Einzelerlegungen** von 1946 bis 2026, nur Summen je Person und je Jagd. Der
-- Weg dorthin sind die Einzelberichte, die JHL zu jeder Jagd schreibt (Buecher
-- 1968-1995, danach Dateien); sie tragen laut seiner Mail Erleger UND Art je
-- Jagd. Faellig, wenn sie digital vorliegen — nicht vorher.
--
-- **KEINE 124 `hunts`-ZEILEN**, obwohl der erste Vorschlag genau das war
-- (Moritz: „da koennten wir je aufgelisteter Jagd eine erstellen und die
-- strecke eintragen ?"). Drei Gruende, alle nachgesehen:
--   1. `hunts` hat **keine Streckenspalte**. Die Strecke ist `count(kills)`;
--      eine Jagd mit „Strecke 46, 0 kills" zeigte 0. Eine Spalte
--      `historische_strecke` waere bei allen 24 echten Jagden NULL und bei
--      124 erfundenen gesetzt — eine zweite Wahrheit in derselben Tabelle.
--   2. **56 der 124 Jagden haben kein Datum.** `scheduled_for` muesste erfunden
--      werden.
--   3. 124 Zeilen aus 1993 lagen danach in jeder Jagdliste und in jedem
--      Tagebuch-Filter.
--
-- DIE REGEL, OHNE DIE JEDE AUSWERTUNG FALSCH WIRD
-- ------------------------------------------------
-- **Die vier Quellen sind keine addierbaren Toepfe, sondern vier Projektionen
-- DESSELBEN Bestands.** An den Dateien nachgerechnet (06.08.2026):
--
--     quelle              Projektion                        Summe   Zeitraum
--     rangliste_soeder    Person x Soeder x Lebenssumme       4646   1946-2026
--     jagden_soeder       Jagd (Jahr x Termin) x Soeder       3221   1993-2026
--     familie_jahr        Person x Jahr x Art, ALLE Reviere   1875   1974-2026
--     journal_msl         Tag x Ort x Art, EIN Erleger        1394   1997-2026
--
--   * `jagden_soeder` (3221) **steckt in** `rangliste_soeder` (4646). Wer beide
--     summiert, zaehlt 3221 Stueck doppelt.
--   * `journal_msl` (77 Soeder-Sauen, alle Jagdarten) **enthaelt**
--     `rangliste_soeder` (50 Soeder-Sauen desselben Mannes, „ohne Maisjagden").
--   * `familie_jahr` zaehlt **alle Reviere** (JHL 1368) gegen den Soeder-Anteil
--     derselben Person in `rangliste_soeder` (JHL 312).
--
-- **Daraus folgt: jede Statistik waehlt genau EINE Projektion ueber `quelle`.
-- Es gibt keine Abfrage, die ueber `quelle` hinweg summiert.**
--
-- Deshalb legt diese Datei **KEINE View** an, die `kills` und die Historie
-- vereinigt. Eine solche View war der naheliegende Weg, Moritz' Entscheidung
-- „in die Revier-Statistik einrechnen" umzusetzen, und sie waere exakt der
-- Doppelzaehl-Fehler oben — nur fest eingebaut und dann von jedem Aufrufer
-- geglaubt. Die Entscheidung wird stattdessen je FRAGE umgesetzt (Konzept §6).
--
-- **Sie legt aber VIER Views an, eine je Projektion, und das ist eine Korrektur
-- am ersten Entwurf.** Der liess die Regel allein im Tabellenkommentar stehen;
-- die Fremdpruefung hat das als P7 [high] markiert, und der Einwand ist
-- schlicht richtig: SQL liest keine Kommentare. `sum(anzahl) group by
-- kontakt_id` ohne `quelle`-Filter zaehlt jeden doppelt, der in mehreren
-- Quellen steht — bei Moritz dreifach. Die Views verdrahten den Filter, damit
-- der richtige Weg der bequeme ist. Details und die `security_invoker`-Falle
-- stehen unten bei ihrer Anlage.
--
-- **Der Schnitt zu den Live-Daten ist sauber, und das ist gemessen statt
-- gehofft:** die Historie endet am 31.01.2026, die erste Erlegung der Datenbank
-- ist vom 19.05.2026, und **0 von 22** Live-Erlegungen liegen in Soeder. Fuer
-- „Soeder gesamt seit 1946" laesst sich `rangliste_soeder` also ohne einen
-- einzigen Sonderfall zu `kills` addieren. Wer diese Zusicherung spaeter nutzt,
-- muss sie nachrechnen — sie gilt nicht kraft Entwurf, sondern kraft Bestand.
--
-- EINE TABELLE FUER ALLE VIER QUELLEN, NICHT VIER
-- ------------------------------------------------
-- Die gemeinsame Form ist `(wer?, wann?, wo?, was?) -> anzahl`; jede Quelle
-- laesst andere Felder leer. Vier Tabellen waeren vier RLS-Flaechen und
-- 16 Policies fuer vier Projektionen derselben Sache.
--
-- Preis, benannt: viele NULL-Spalten je Zeile, und nichts im Schema erzwingt,
-- dass eine Quelle die zu ihr passenden Felder fuellt. Das ist Absicht, s. den
-- naechsten Absatz.
--
-- EIN CHECK JE `quelle` — UND WARUM DER ERSTE ENTWURF IHN FALSCH ABGELEHNT HAT
-- ----------------------------------------------------------------------------
-- Der erste Entwurf verzichtete auf Pflichtfeld-Pruefungen je Quelle und berief
-- sich auf 105: **„ein Constraint, der Spalten aufzaehlt, ist eine Stelle, die
-- jede spaetere Spalte mitpflegen muss."** Die Fremdpruefung vom 06.08.2026 hat
-- das als P6 zerlegt, und ihr Einwand ist besser als meine Begruendung war.
--
-- **Der Vergleich mit 105 trug nicht.** Dort war es EIN Constraint
-- (`hunting_licenses_ohne_entgelt`), der die Spalten einer ganzen Familie
-- aufzaehlte und deshalb bei jeder neuen Spalte neu gefasst werden musste. Die
-- Form hier ist `quelle <> '<wert>' or (…)`: jeder CHECK betrifft GENAU EINE
-- Quelle und ist von den anderen unabhaengig. Eine fuenfte Quelle bekommt einen
-- fuenften CHECK; die vier bestehenden werden nicht angefasst. Das ist das
-- Gegenteil der Falle aus 105.
--
-- **Wogegen sie schuetzen, ist lautlos:** eine Zeile `quelle='jagden_soeder'`
-- mit `termin=NULL` besteht alle uebrigen CHECKs. Zeilenzahl, Gesamtsumme und
-- Jahressumme stimmen weiter — nur die Auswertung nach Termin verliert die
-- Zeile oder legt sie in eine NULL-Gruppe. Genau die Klasse Fehler, gegen die
-- der Import und seine Summenproben blind sind.
--
-- KONTOLOESCHUNG DARF DIE CHRONIK NICHT MITNEHMEN
-- -----------------------------------------------
-- `besitzer_id` steht auf **RESTRICT**, nicht auf CASCADE wie das Vorbild
-- `kontakte.besitzer_id` (085). Fremdpruefung 06.08.2026, P4 [high], und der
-- Befund benennt eine Asymmetrie, die ich selbst gebaut hatte: eine geloeschte
-- Person und ein geloeschtes Revier lassen die Chronikzeile stehen
-- (`set null` + `erleger_name`/`ort_text`), ein geloeschtes KONTO haette alle
-- bis zu 945 Zeilen mitgenommen.
--
-- **Der Unterschied zu 085 ist, wessen Daten es sind.** Ein Adressbuch gehoert
-- dem, der es fuehrt; diese Chronik ist die Arbeit von Jobst-Heinrich Lampe
-- ueber 80 Jahre und existiert digital nur hier. Sie am Lebenszyklus eines
-- einzelnen Auth-Kontos haengen zu lassen, waere dieselbe Bauform wie ein
-- Backup auf derselben Platte.
--
-- Preis, benannt: das Konto laesst sich nicht loeschen, solange Chronikzeilen
-- daran haengen — der Versuch scheitert mit `23503`. Das ist gewollt: der
-- Fehler sagt „vorher uebertragen oder ausleiten". Ein Besitzertransfer ist
-- heute ein UPDATE auf `besitzer_id`, das der Besitzer selbst nicht machen kann
-- (die UPDATE-Policy verbietet das Verschenken) — er braucht `service_role`.
-- Das ist die richtige Reibung fuer eine Handlung, die es einmal geben wird.
--
-- WIEDERHOLTER IMPORT DARF NICHT VERDOPPELN
-- ------------------------------------------
-- `quell_zeile` plus `unique (besitzer_id, quelle, quell_zeile)`.
-- Fremdpruefung 06.08.2026, S6 [high]: ohne einen stabilen Schluessel bekommt
-- jede Zeile nur eine zufaellige UUID. Commitet ein Import, waehrend der
-- Aufrufer einen Timeout sieht, erzeugt der Wiederholungslauf lauter neue,
-- **gueltige** Zeilen — und die Chronik ist still doppelt so hoch. Bei 357
-- Zeilen fiele das an der Gesamtsumme auf, bei einer Teilkorrektur nicht.
--
-- **Damit ist auch der Rueckweg besser als `delete where quelle = …`**, auf den
-- der erste Entwurf gesetzt hat (und der die Begruendung fuer den fehlenden
-- `created_at` trug): ein zweiter Lauf trifft dieselben Schluessel und kann nur
-- upserten. Die Frage „welcher Lauf war das" stellt sich nicht mehr, weil es je
-- Quellzeile genau eine Zeile gibt — das ist zugleich die Antwort auf S9
-- (Provenienz), ohne eine eigene Importtabelle.
--
-- `erleger_name` NEBEN `kontakt_id`, `ort_text` NEBEN `district_id`
-- -----------------------------------------------------------------
-- Der Name auf dem Papier ist die Wahrheit, der Fremdschluessel ist die
-- verlierbare Verknuepfung. Beide FKs stehen auf `on delete set null`, damit
-- eine geloeschte Person oder ein geloeschtes Revier die Chronikzeile nicht
-- mitnimmt — 80 Jahre Streckenbuch haengen sonst an einer Adressbuchzeile.
--
-- Dieselbe Begruendung wie `kontakt_id` in 106: daran haengt keine
-- Berechtigung, nur eine Zuordnung. Und derselbe gemessene Anlass wie dort —
-- Namen tragen die Zuordnung in diesem Bestand nachweislich nicht: 47 der
-- 154 Kontakte teilen sich ein abgeleitetes Kuerzel (086), und die drei
-- **Carl Graf v. Hardenberg** sind kein Dubletten-Fehler, sondern drei
-- Generationen — `Carli sen.` (25 Stueck, verstorben), `Carli jun.` (10, Carl
-- Senior), `jun.jun.` (33, Carl Junior). Wer nur den Namen hat, haengt die
-- Historie an den falschen.
--
-- **Der Abgleich ist gemessen, nicht geschaetzt:** von 209 Personen treffen
-- 106 auf einen bestehenden Kontakt, 103 werden als inaktive Kontakte angelegt
-- (Moritz' Entscheidung vom 06.08.2026) — darunter Verstorbene wie Rickwan
-- Frhr.v.d. Lancken-Wakenitz (141 Stueck) und die Jagdherren von 1924-1968.
-- Die 209 Personen teilen sich 208 Kontakte: das Ehepaar Moeller ist im
-- Adressbuch ein Eintrag, das Papier fuehrt beide Hundefuehrer getrennt.
--
-- **Der Namensabgleich allein schaffte es NICHT — fuenf Zuordnungen musste
-- Moritz entscheiden, und vier davon waren Fehler des Abgleichs.** Der
-- Generator bricht ab, wenn zwei Papiernamen auf denselben Kontakt zeigen; so
-- sind sie aufgefallen:
--   * die drei Carl (oben) — der Rufname „Carli" gegen „Carl" macht sie fuer
--     einen Token-Vergleich unsichtbar;
--   * `Papi/Heinrich Lampe, Jagdherr "1969"-1992` (77 Stueck) landete auf dem
--     Kontakt von Jobst-Heinrich Lampe (312), weil „Heinrich" und „Lampe" in
--     beiden Namen stehen. **Das haette dem Vater die Strecke des Grossvaters
--     zugeschrieben** — 389 statt 312, und die 77 haette niemand vermisst.
--     Er ist jetzt ein eigener inaktiver Kontakt.
--   * zwei `Ludolf v. Veltheim` (166 / 11) und zwei `Albrecht v. Alvensleben`
--     (23 / 11) — je zwei Menschen auf einen Kontakt.
--   * `Nick v. Veltheim` ist Nikolaus v. Veltheim (Rufname, kein Treffer).
--     `Hundefuehrer G. Ritter` und `Rico Schoekel` sind dagegen NICHT Georg
--     Ritter bzw. Richard Schoekel — sie werden neu angelegt.
--
-- **Die Lehre fuer den naechsten Abgleich:** ein Token-Vergleich findet keine
-- Rufnamen und keine Generationen. Der Riegel ist nicht der Vergleich, sondern
-- der Abbruch bei doppelt belegtem Ziel plus eine Liste zum Gegenlesen.
--
-- KEIN `wildart_id`, OBWOHL DER KATALOG AUS 096 EXISTIERT
-- -------------------------------------------------------
-- Nachgesehen statt angenommen, und das Ergebnis hat eine Spalte gespart:
--   * `familie_jahr` nennt **Gruppen** — „Sauen", „Diverses" —, keine Arten.
--     `wildarten` fuehrt 87 Arten; „Diverses" ist keine davon.
--   * `journal_msl` nennt 25 Bezeichnungen, von denen die meisten im Katalog
--     nicht vorkommen: Kangaroo, Puhvogel, Zappe, Waterdeer, Geier, Rothuehner.
-- Die Spalte waere ueberwiegend NULL, und ihr RESTRICT (so steht
-- `kills.wildart_id` in 096) waere ein Riegel ohne Gegenstand. `art_text`
-- traegt die Papierbezeichnung wortgetreu; eine Katalog-Zuordnung ist ein
-- spaeterer, optionaler Schritt und braucht dann eine Entscheidung darueber,
-- was aus „Diverses" wird.
--
-- WER LESEN UND SCHREIBEN DARF
-- -----------------------------
-- Nur der Besitzer der Zeile, ueber `besitzer_id = auth.uid()`. Der Zuschnitt
-- ist von `kontakte` (085) abgeschrieben — die Chronik gehoert einer Person,
-- nicht einem Revier. **Die Kaskade weicht dagegen ab: RESTRICT statt CASCADE**,
-- s. den Abschnitt „Kontoloeschung" oben.
--
-- **Nicht `districts.owner_id`**, obwohl 079 und 109 diesen Zuschnitt haben und
-- er hier naheliegt: `familie_jahr` zaehlt ueber Reviere hinweg und
-- `journal_msl` ueber 54 Orte, die keine Reviere dieser Datenbank sind (Polen,
-- Ungarn, UK, Ukraine). Deren `district_id` ist NULL, und eine NULL laesst sich
-- gegen kein `owner_id` pruefen. Ein zweigeteiltes Praedikat („Besitzer der
-- Zeile ODER Besitzer des Reviers") waere ein zweiter Weg zu derselben Zeile,
-- und der laengere Weg traegt heute nichts: es gibt projektweit zwei Reviere
-- mit demselben Besitzer.
--
-- **VIER POLICIES JE KOMMANDO STATT EINER `for all`** — dieselbe Begruendung
-- wie 079 und 109: eine `for all`-Policy prueft ihr USING auch gegen die NEUE
-- Zeile, ein eigener `with check` hebt das nicht auf.
--
-- Die Bedingung ist hier in allen vier Faellen zeichengleich `besitzer_id =
-- auth.uid()` und braucht keine Subquery — anders als in 109, wo drei Kopien
-- eines JOINs die „eine aendern, drei vergessen"-Falle waren. Ein
-- Spaltenvergleich hat diese Falle nicht.
--
-- **`besitzer_id` braucht heute KEINEN Riegel** wie `kontakt_feste_spalten`
-- (085), und der Grund ist praeziser als „noch niemand teilt": dort war das
-- Problem, dass Mitfuehrende die Zeile SEHEN — sie konnten
-- `set besitzer_id = ich` schreiben, weil USING und WITH CHECK beide erfuellt
-- waren, und der Besitzer verlor den Kontakt. Hier sieht **niemand ausser dem
-- Besitzer** die Zeile, also kann sie auch niemand aneignen.
--
-- **Faellig zusammen mit dem Teilen, und das ist absehbar:** JHL fuehrt diese
-- Chronik, hat aber kein Konto in dieser Datenbank. Solange nicht, ist sie nur
-- fuer Moritz lesbar. Kommt das Teilen (Bauform `kontakt_mitfuehrende` aus
-- 085), kommt derselbe Riegel mit — sonst wiederholt sich der Befund von 085
-- zeichengleich.
--
-- KEINE BERECHTIGUNG LEITET SICH AUS DIESER TABELLE AB
-- -----------------------------------------------------
-- Derselbe Nicht-Tun-Riegel wie bei 101, 103, 105 und 109: keine Policy einer
-- anderen Tabelle darf `historische_strecken` auswerten. Die Zeilen sind vom
-- Besitzer frei schreibbar — `erleger_name` ist Freitext, `kontakt_id` waehlt
-- er selbst. Wer daraus je ein Recht ableitete („wer in Soeder geschossen hat,
-- darf …"), baute die Bauform, an der `hunts.wildart_ids` in 096 gescheitert
-- ist: ein Feld, das der Angreifer selbst schreibt.
--
-- Gegenprobe fuer einen spaeteren Lauf (muss 0 Zeilen liefern):
--
--     select polname from pg_policy
--      where polrelid <> 'public.historische_strecken'::regclass
--        and (pg_get_expr(polqual, polrelid)      ilike '%historische\_strecken%'
--          or pg_get_expr(polwithcheck, polrelid) ilike '%historische\_strecken%');
--
-- WAS DIE DATEI NICHT ANLEGT
-- ---------------------------
-- Kein `updated_at` und kein Trigger dafuer: eine Chronikzeile von 1946 wird
-- angelegt und nicht gepflegt. Keine Funktion, keine RPC.
--
-- **Auch kein `created_at`, und hier widersprechen sich zwei Pruefer.** Die
-- Ponytail-Lesung vom 06.08.2026 wollte es streichen: anders als in 109
-- (dort „wann wurde quittiert", neben „wann kam das Geld") hiesse es hier nur
-- „wann habe ich importiert", und das fragt niemand. Die Fremdpruefung
-- desselben Tages wollte es als Teil der Provenienz haben (S9).
--
-- **Es bleibt draussen, weil der S6-Fix das Argument der Fremdpruefung
-- uebernimmt:** mit `unique (besitzer_id, quelle, quell_zeile)` gibt es je
-- Quellzeile genau EINE Zeile, ein Reimport ist ein Upsert, und die Frage
-- „welcher Lauf war das" hat keinen Gegenstand mehr. Provenienz ist damit
-- `(quelle, quell_zeile)` — praeziser als ein Zeitstempel, weil sie auf die
-- Zelle im Papier zeigt statt auf eine Uhrzeit. Der Rest von S9 (Batch-Tabelle,
-- Quelldokument-Revision) bleibt bewusst offen: vier einmalige Importe
-- rechtfertigen keine zweite Tabelle. **Nach der Projektregel entscheidet bei
-- widersprechenden Pruefern Moritz** — die Zeile steht hier, damit er es kann.
--
-- **Kein Index ausser dem UNIQUE aus S6**, und der ist ein Constraint, kein
-- Leistungsindex. Am Ende aller vier Stufen sind es 945 Zeilen; ein Index auf
-- `kontakt_id` oder `quelle` waere Zierde und kostet spaeter ein
-- `create index`. Dieselbe Abwaegung wie der FK-Index in 109.
--
-- **Kein Riegel auf `jagdjahr`.** Ein `check (jagdjahr between 1900 and 2100)`
-- guardierte einen Vertipper, aber die Werte kommen aus Dateien und nicht aus
-- einem Formular — es gibt heute keinen Client, der schreibt. Faellig, wenn im
-- Portal von Hand erfasst wird.
--
-- **Kein `<> 'NaN'`**, anders als 109: `anzahl` ist `int`, und die NaN-Falle
-- (`'NaN'::numeric > 0` ist wahr) gilt nur fuer `numeric`/`float`. Ein
-- `{"anzahl":"NaN"}` ueber PostgREST scheitert am Typcast mit `22P02`.
--
-- **Kein `grant`** — aber ein `revoke`, und das ist der Unterschied zu 109.
-- Supabase vergibt die Rechte fuer neue Tabellen in `public` per `alter default
-- privileges`; `anon` hat dort SELECT (an 085 und 096 gemessen). 109 liess das
-- so stehen, weil dort eine leere Antwort fuer `anon` harmlos ist. Hier ist sie
-- es nicht: eine Chronik, die „0 Stueck seit 1946" sagt, ist eine glaubwuerdige
-- Falschauskunft (S4). Deshalb `revoke select … from anon` unten — **und
-- deshalb liefert die anon-Gegenprobe hier ein `42501` statt einer Zahl**,
-- anders als die Regel in AGENTS.md es sonst verlangt.
--
-- Ein zusaetzlicher `grant` fuer `authenticated` bleibt trotzdem weg: die
-- angekuendigte Umstellung der Voreinstellung (neue Projekte seit Mai 2026,
-- bestehende Oktober 2026) traefe alle Tabellen gleichzeitig, ein Grant nur
-- hier waere eine Insel. Der Punkt liegt projektweit im Backlog.
--
-- IDEMPOTENZ — GANZ ODER GAR NICHT
-- ---------------------------------
-- `create policy` kennt kein `if not exists`. Ohne die vier `drop policy if
-- exists` unten waere `create table if not exists` oben ein leeres Versprechen:
-- der zweite Lauf stuerbe an `duplicate_object`, waehrend die erste Zeile
-- Wiederholbarkeit behauptet. Derselbe Befund, den 079 vor dem Applizieren
-- kassiert hat.
--
-- Was die Datei NICHT leistet, obwohl „idempotent" danach klingt: sie stellt
-- den Sollzustand nicht her. Eine bereits bestehende `historische_strecken`
-- bekaeme weder eine fehlende Spalte noch einen CHECK nachgereicht.
--
-- Bestand bei Anlage (gemessen 06.08.2026): 154 Kontakte (davon 32 inaktiv,
-- 0 mit `profil_id`), 22 Erlegungen (0 in Soeder), 24 Jagden, 2 Reviere.
-- `historische_strecken` existiert nicht.

create table if not exists public.historische_strecken (
  id            uuid primary key default gen_random_uuid(),

  -- Wem die Chronikzeile gehoert. Abgeschrieben von `kontakte.besitzer_id`
  -- (085) — aber mit RESTRICT statt CASCADE, und das ist eine bewusste
  -- Abweichung vom Vorbild. Begruendung im Kopf, Abschnitt „Kontoloeschung".
  besitzer_id   uuid not null references auth.users(id) on delete restrict,

  -- WELCHE ZEILE DER QUELLE. Ein aus dem Papier abgeleiteter, stabiler
  -- Schluessel — nicht der Anzeigename, sondern die Koordinate der Zelle:
  --   rangliste_soeder  '<Papiername>|<art_text>'
  --   jagden_soeder     '<jagdjahr>|<termin>'
  --   familie_jahr      '<Person>|<jagdjahr>|<art_text>'
  --   journal_msl       '<erlegt_am>|<ort_text>|<art_text>'
  -- Zusammen mit dem UNIQUE unten macht er den Import wiederholbar: ein
  -- zweiter Lauf trifft dieselben Schluessel und kann nur upserten, nicht
  -- verdoppeln. Siehe Kopf, Abschnitt „Wiederholter Import".
  quell_zeile   text not null,

  -- WELCHE PROJEKTION. Der Wert entscheidet, welche der uebrigen Spalten
  -- gefuellt sind — und er ist der Filter, ohne den jede Summe falsch ist
  -- (s. „Die Regel" im Kopf). `text` mit CHECK statt Enum, aus dem Grund, den
  -- 105 ausschreibt: ein Enum zu erweitern ist in Postgres der teurere Weg
  -- (`alter type … add value` ist nicht ruecknehmbar), ein CHECK ist
  -- drop-and-recreate. Eine fuenfte Quelle kostet damit eine Zeile.
  quelle        text not null,

  -- WO. `district_id` nur, wenn der Ort ein Revier DIESER Datenbank ist —
  -- bei `familie_jahr` (alle Reviere) und bei 54 der 56 Orte aus
  -- `journal_msl` (Polen, Ungarn, UK, Ukraine) ist er NULL. `ort_text` traegt
  -- die Bezeichnung des Papiers und ueberlebt ein geloeschtes Revier.
  district_id   uuid references public.districts(id) on delete set null,
  ort_text      text,

  -- WER. `kontakt_id` ist die Verknuepfung, `erleger_name` die Wahrheit.
  -- Beide duerfen NULL sein: `jagden_soeder` kennt keinen Erleger (die Quelle
  -- summiert je Jagd), und ein Name ohne Kontakt bleibt lesbar.
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  erleger_name  text,

  -- WANN. Drei Koernungen, je Quelle eine:
  --   NULL                -> Lebenssumme (rangliste_soeder)
  --   jagdjahr            -> Saison; 1993 heisst 1993/94 (jagden_soeder, familie_jahr)
  --   jagdjahr + termin   -> die einzelne Jagd (jagden_soeder)
  --   erlegt_am           -> der Tag (journal_msl)
  jagdjahr      int,
  termin        text,
  erlegt_am     date,

  -- WAS. Die Bezeichnung des Papiers, wortgetreu — „Sauen", „D&R&F",
  -- „Rothuehner", „Kangaroo". NULL bei `jagden_soeder`, das nur Gesamtstrecken
  -- kennt. Kein `wildart_id`, s. Kopf.
  art_text      text,

  anzahl        int not null,

  -- Freitext des Papiers: „Keiler", „Button", „Jagdherr seit 1993",
  -- „Maishaeckseln". Traegt auch die Generationen-Kennung der drei Carl.
  notiz         text,

  -- Eine Chronikzeile mit 0 Stueck ist keine, eine negative waere ein
  -- Rechenfehler der Quelle. Kein `<> 'NaN'` — `int` kann es nicht, s. Kopf.
  constraint historische_strecken_anzahl_positiv
    check (anzahl > 0),

  -- Die vier Quellen. Ein fuenfter Wert kostet ein drop-and-recreate dieses
  -- CHECKs und sonst nichts.
  constraint historische_strecken_quelle
    check (quelle in ('rangliste_soeder','jagden_soeder','familie_jahr','journal_msl')),

  -- Die sieben Termine, die „Kreaturen je Monat" fuehrt. Er steht hier, obwohl
  -- nur ein Importskript schreibt, weil die Jahressummen einen verrutschten
  -- Slot NICHT fangen — `'nov_frueh '` mit Leerzeichen zerlegte lautlos die
  -- Slot-Gruppierung, waehrend jede Summe weiter stimmte. Dieselbe Falle, die
  -- AGENTS.md fuer die Gruppen-Arrays in 099 benennt.
  constraint historische_strecken_termin
    check (termin is null or termin in
      ('okt','nov_frueh','nov_spaet','dez_frueh','dez_spaet','jan_frueh','jan_spaet')),

  -- Ein Import darf sich nicht verdoppeln. Ohne diesen Schluessel erzeugt ein
  -- Wiederholungslauf nach einem Timeout lauter neue, gueltige Zeilen und die
  -- Statistik ist still doppelt so hoch (Fremdpruefung 06.08.2026, S6 [high]).
  constraint historische_strecken_quell_zeile_eindeutig
    unique (besitzer_id, quelle, quell_zeile),

  -- --- Pflichtfelder je Quelle -------------------------------------------
  -- Jeder dieser vier CHECKs betrifft GENAU EINE Quelle und ist von den
  -- anderen unabhaengig: eine fuenfte Quelle bekommt einen fuenften CHECK und
  -- laesst diese vier unberuehrt. **Das ist der Unterschied zu der Falle aus
  -- 105**, wo EIN Constraint die Spalten einer ganzen Familie aufzaehlte und
  -- deshalb bei jeder neuen Spalte neu gefasst werden musste. Der erste
  -- Entwurf hat 105 hier falsch zitiert und die Pruefung ganz weggelassen;
  -- die Fremdpruefung vom 06.08.2026 hat es als P6 gefunden.
  --
  -- Wogegen sie schuetzen: eine Zeile `quelle='jagden_soeder'` mit
  -- `termin=NULL` besteht alle uebrigen CHECKs, und Zeilenzahl, Gesamt- und
  -- Jahressumme stimmen weiter — nur die Auswertung nach Termin verliert die
  -- Zeile oder legt sie in eine NULL-Gruppe. Lautlos falsch, nicht laut kaputt.
  -- `kontakt_id` bleibt hier ausdruecklich frei: die Kollektivzeilen des
  -- Papiers (Hunde 54, Fallwild 3, Hundefuehrer 5, Treiber 1, „verschiedene
  -- Schuetzen (vor 1968)" 14) sind keine Personen und haben keinen Kontakt.
  -- Sie muessen trotzdem herein, sonst ergibt die Soeder-Summe 4583 statt der
  -- 4646, die auf dem Papier steht — und die Zahl des Papiers ist die, die
  -- Moritz kennt.
  constraint historische_strecken_rangliste_vollstaendig
    check (quelle <> 'rangliste_soeder' or
           (erleger_name is not null and art_text is not null
            and district_id is not null
            and jagdjahr is null and termin is null and erlegt_am is null)),

  -- `art_text is null`, weil diese Quelle nur GESAMTstrecken je Jagd kennt —
  -- eine Artangabe waere erfunden. `erleger_name is null` aus demselben Grund.
  constraint historische_strecken_jagden_vollstaendig
    check (quelle <> 'jagden_soeder' or
           (jagdjahr is not null and termin is not null
            and district_id is not null and erleger_name is null
            and kontakt_id is null and art_text is null and erlegt_am is null)),

  -- `district_id is null` ist hier kein Versehen, sondern die Aussage der
  -- Quelle: `familie_jahr` zaehlt ueber ALLE Reviere. Eine Zeile mit Revier
  -- waere ein Widerspruch und wuerde in einer Soeder-Summe mitzaehlen.
  constraint historische_strecken_familie_vollstaendig
    check (quelle <> 'familie_jahr' or
           (erleger_name is not null and jagdjahr is not null
            and art_text is not null and district_id is null and termin is null)),

  constraint historische_strecken_journal_vollstaendig
    check (quelle <> 'journal_msl' or
           (erlegt_am is not null and ort_text is not null
            and art_text is not null and jagdjahr is null and termin is null))
);

comment on table public.historische_strecken is
  'Chronik der Drueckjagden in Soeder ab 19.02.1946 (110, 06.08.2026). Quelle sind sechs '
  'Excel-Dateien von Jobst-Heinrich Lampe; es sind AGGREGATE, keine Einzelerlegungen — die '
  'existieren als Daten nicht. Ausdruecklich NICHT in kills, weil kills.reporter_id NOT NULL '
  'ist und participant_id laut 092 dem Melder gehoeren muss: eine Erlegung ohne Konto ist '
  'dort nicht darstellbar. '
  'ACHTUNG, DIE EINZIGE REGEL, DIE DIESE TABELLE MISSBRAUCHBAR MACHT: die Werte von quelle '
  'sind vier PROJEKTIONEN desselben Bestands, keine addierbaren Toepfe — jagden_soeder (3221) '
  'steckt in rangliste_soeder (4646), journal_msl enthaelt dessen Soeder-Anteil, familie_jahr '
  'zaehlt alle Reviere. Jede Abfrage filtert auf GENAU EINE quelle; eine Abfrage ohne '
  'quelle-Filter ist per Definition falsch. KEIN Berechtigungstraeger: keine Policy einer '
  'anderen Tabelle darf diese hier auswerten.';

comment on column public.historische_strecken.quelle is
  'Welche Projektion die Zeile ist und damit, welche der uebrigen Spalten gefuellt sind. '
  'rangliste_soeder = Person x Soeder x Lebenssumme (Datei 1946bisheute, Blatt aktuellerRang '
  '— NICHT nachGesamt, das traegt #ERR und verrutschte Spalten). jagden_soeder = Jagd '
  '(jagdjahr + termin) x Soeder (Kreaturen je Monat). familie_jahr = Person x jagdjahr x Art '
  'ueber ALLE Reviere, district_id daher NULL (Drueckjagdstrecken Familie). journal_msl = '
  'Tag x Ort x Art fuer einen Erleger (Abschuesse Moritz). Niemals ueber Werte summieren.';

comment on column public.historische_strecken.quell_zeile is
  'Stabiler Schluessel der Quellzeile — die Koordinate der Zelle im Papier, nicht der '
  'Anzeigename: rangliste_soeder "<Papiername>|<art_text>", jagden_soeder '
  '"<jagdjahr>|<termin>", familie_jahr "<Person>|<jagdjahr>|<art_text>", journal_msl '
  '"<erlegt_am>|<ort_text>|<art_text>". Zusammen mit dem UNIQUE macht er den Import '
  'wiederholbar: ein zweiter Lauf trifft dieselben Schluessel und kann nur upserten, nicht '
  'verdoppeln. Er ist zugleich die Provenienz — genauer als ein Zeitstempel, weil er auf '
  'die Zelle zeigt statt auf eine Uhrzeit.';

comment on column public.historische_strecken.erleger_name is
  'Der Name, wie er auf dem Papier steht — die Wahrheit der Zeile. kontakt_id daneben ist die '
  'verlierbare Verknuepfung (on delete set null). Beides, weil Namen die Zuordnung in diesem '
  'Bestand nicht tragen: 47 der 154 Kontakte teilen ein abgeleitetes Kuerzel (086), und die '
  'drei Carl Graf v. Hardenberg sind drei Generationen (Carli sen. / Carli jun. / jun.jun.), '
  'kein Dubletten-Fehler.';

comment on column public.historische_strecken.jagdjahr is
  'Die Saison, mit dem Anfangsjahr benannt: 1993 heisst 1993/94. NULL bei rangliste_soeder '
  '(Lebenssummen ohne Jahresachse) und bei journal_msl (dort steht erlegt_am).';

comment on column public.historische_strecken.art_text is
  'Die Wildbezeichnung des Papiers, wortgetreu und absichtlich nicht normalisiert: '
  'rangliste_soeder kennt nur "Sauen" und "D&R&F", familie_jahr nennt GRUPPEN ("Sauen", '
  '"Diverses"), journal_msl 25 Bezeichnungen, die im Katalog aus 096 ueberwiegend fehlen '
  '(Kangaroo, Puhvogel, Zappe, Waterdeer). Deshalb kein wildart_id. NULL bei jagden_soeder, '
  'das nur Gesamtstrecken kennt.';

alter table public.historische_strecken enable row level security;

-- Vorsorglich: `create policy` kennt kein `if not exists`. Ohne diese vier
-- Zeilen verspraeche `create table if not exists` oben eine Wiederholbarkeit,
-- die die Datei gleich darauf wieder einreisst.
drop policy if exists historische_strecken_select on public.historische_strecken;
drop policy if exists historische_strecken_insert on public.historische_strecken;
drop policy if exists historische_strecken_update on public.historische_strecken;
drop policy if exists historische_strecken_delete on public.historische_strecken;

-- ---------------------------------------------------------------------------
-- Vier Policies je Kommando, Bedingung ueberall `besitzer_id = auth.uid()`
-- ---------------------------------------------------------------------------
-- Getrennt und nicht als `for all`, weil eine `for all`-Policy ihr USING auch
-- gegen die NEUE Zeile prueft (AGENTS.md, 079, 109). Dass die vier Ausdruecke
-- hier identisch sind, ist kein Argument fuer `for all` — es ist nur der Fall,
-- in dem der Unterschied heute nicht auffaellt.
--
-- `to authenticated` steht dran, weil `anon` die Bedingung nie erfuellt
-- (`auth.uid()` ist dort NULL) und weil eine Policy ohne Rollenangabe fuer
-- `anon` auswertet, was sie nicht muss. Keine dieser Bedingungen ruft eine
-- Funktion, es entsteht also kein `42501` aus dem Policy-Ausdruck wie in
-- 077/078 — das `42501` unten kommt vom fehlenden Tabellenrecht, nicht von hier.
create policy historische_strecken_select on public.historische_strecken
  for select
  to authenticated
  using (besitzer_id = auth.uid());

create policy historische_strecken_insert on public.historische_strecken
  for insert
  to authenticated
  with check (besitzer_id = auth.uid());

-- USING und WITH CHECK tragen dieselbe Bedingung: ohne den WITH CHECK liesse
-- sich eine Zeile per `set besitzer_id = <fremd>` aus der eigenen Chronik
-- heraus verschenken. Dass es niemandem nuetzt, ist kein Grund, es zu erlauben.
create policy historische_strecken_update on public.historische_strecken
  for update
  to authenticated
  using (besitzer_id = auth.uid())
  with check (besitzer_id = auth.uid());

create policy historische_strecken_delete on public.historische_strecken
  for delete
  to authenticated
  using (besitzer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- `anon` bekommt das SELECT-Recht ausdruecklich ENTZOGEN
-- ---------------------------------------------------------------------------
-- **Das ist eine bewusste Abweichung von der Gegenprobe, die AGENTS.md sonst
-- fordert** („begin; set local role anon; select count(*) … muss eine Zahl
-- liefern, keinen Fehler"). Diese Regel schuetzt den Gast-/Akquise-Layer der
-- PWA, der als `anon` liest — auf diese Tabelle greift dort nichts zu, heute
-- und nach dem Entwurf auch nie.
--
-- Ohne den Entzug haette `anon` per Supabase-Voreinstellung SELECT auf der
-- Tabelle, waehrend die einzige SELECT-Policy `to authenticated` lautet.
-- Ergebnis: eine anonyme Anfrage liefert erfolgreich NULL Zeilen. Ein Client
-- mit abgelaufener Sitzung baute daraus die Auskunft „0 Stueck seit 1946"
-- statt eines Berechtigungsfehlers — der S4-Fall aus dem Standard-Focus, von
-- der Fremdpruefung am 06.08.2026 gefunden. Bei einer Chronik ist eine
-- glaubwuerdige Null schlimmer als ein Fehler.
--
-- Die Rollen werden NAMENTLICH genannt: `revoke … from public` entzieht bei
-- Supabase nichts, weil die Rechte per `alter default privileges` explizit an
-- `anon`, `authenticated` und `service_role` gehen (AGENTS.md, an
-- `stand_ist_belegt()` gemessen). `authenticated` behaelt sein Recht, `anon`
-- verliert es.
revoke select on public.historische_strecken from anon;

-- ---------------------------------------------------------------------------
-- Vier Views — eine je Projektion, weil ein Kommentar keine Mechanik ist
-- ---------------------------------------------------------------------------
-- Die Regel „jede Abfrage filtert auf genau eine `quelle`" stand im ersten
-- Entwurf nur im Tabellenkommentar. Die Fremdpruefung hat das als P7 [high]
-- markiert, und zu Recht: SQL liest keine Kommentare, und `sum(anzahl) group by
-- kontakt_id` ohne Filter zaehlt fuer jeden, der in mehreren Quellen steht,
-- doppelt — bei Moritz gleich dreifach (rangliste_soeder, familie_jahr,
-- journal_msl). Die Views machen den richtigen Weg zum bequemen.
--
-- **`security_invoker = true` ist hier PFLICHT und nicht Kosmetik.** Eine View
-- laeuft in PostgreSQL sonst mit den Rechten ihres EIGENTUEMERS; angelegt aus
-- einer Migration heraus gehoert sie `postgres` und umginge RLS vollstaendig —
-- jeder Angemeldete saehe jede fremde Chronik. Der Schalter dreht das auf die
-- Rechte des Aufrufers, die Policies oben gelten also unveraendert weiter.
-- Genau deshalb stehen die Views in DIESER Datei und nicht in einer spaeteren
-- Portal-Sitzung: wer sie dort ohne den Schalter anlegt, baut das Leck.
--
-- Kein `revoke` auf die Tabelle selbst fuer `authenticated`: der Import und ein
-- spaeterer Editor schreiben direkt, und eine Leseflaeche zu erzwingen, indem
-- man die Schreibflaeche zumauert, braeuchte vier RPCs fuer nichts.
create or replace view public.historische_rangliste_soeder
  with (security_invoker = true) as
  select * from public.historische_strecken where quelle = 'rangliste_soeder';

create or replace view public.historische_jagden_soeder
  with (security_invoker = true) as
  select * from public.historische_strecken where quelle = 'jagden_soeder';

create or replace view public.historische_familie_jahr
  with (security_invoker = true) as
  select * from public.historische_strecken where quelle = 'familie_jahr';

create or replace view public.historische_journal_msl
  with (security_invoker = true) as
  select * from public.historische_strecken where quelle = 'journal_msl';

comment on view public.historische_rangliste_soeder is
  'Projektion Person x Soeder x Lebenssumme (110). Die App liest die Chronik ueber diese '
  'vier Views, nicht ueber die Tabelle: der quelle-Filter ist hier fest verdrahtet, damit '
  'keine Abfrage ueber Projektionen hinweg summiert. security_invoker = true, RLS gilt.';

-- ---------------------------------------------------------------------------
-- Gegenproben nach dem Anwenden (jede mit ROLLBACK, Bestand vorher = nachher)
-- ---------------------------------------------------------------------------
--   Besitzer legt Zeile mit besitzer_id = sich an        -> 1 Zeile
--   Besitzer legt Zeile mit FREMDER besitzer_id an       -> 42501 (with check wirft)
--   Fremder liest die Zeile                              -> 0 Zeilen
--   Fremder aendert sie (set anzahl = anzahl)            -> 0 Zeilen
--   Besitzer verschenkt sie (set besitzer_id = fremd)    -> 42501
--   anzahl = 0 und anzahl = -1                           -> 23514
--   anzahl = 'NaN' ueber PostgREST                       -> 22P02 (Typcast, nicht CHECK)
--   quelle = 'erfunden'                                  -> 23514
--   termin = 'nov_frueh ' (mit Leerzeichen)              -> 23514  (Tippfehler-Riegel)
--   Kontakt loeschen                                     -> kontakt_id wird NULL,
--                                                           erleger_name bleibt stehen
--   Revier loeschen                                      -> district_id wird NULL,
--                                                           ort_text bleibt stehen
--   0 Policies anderer Tabellen werten historische_strecken aus
--   0 SECURITY-DEFINER-Funktionen ohne pg_temp (unveraendert, die Datei legt keine an)
--
-- Gegenproben zu den fuenf Befunden der Fremdpruefung vom 06.08.2026:
--
--   P4  Besitzerkonto loeschen, solange Zeilen existieren -> 23503 (restrict haelt)
--   S6  dieselbe (besitzer_id, quelle, quell_zeile) zweimal einfuegen -> 23505
--   S6  denselben Import zweimal fahren                  -> Bestand unveraendert
--   P6  quelle='jagden_soeder', termin=NULL              -> 23514
--   P6  quelle='familie_jahr' MIT district_id            -> 23514
--   P6  quelle='rangliste_soeder' mit jagdjahr gesetzt   -> 23514
--   P6  quelle='journal_msl' ohne erlegt_am              -> 23514
--   S4  anon: select count(*) from historische_strecken  -> 42501, NICHT eine Zahl
--       (bewusste Abweichung von der AGENTS.md-Gegenprobe, s. den Absatz beim revoke)
--   S4  anon: select count(*) from historische_rangliste_soeder -> 42501
--   P7  Fremder liest jede der vier Views                -> je 0 Zeilen
--       (der Beleg, dass security_invoker greift; ohne den Schalter waeren es ALLE)
--   P7  Besitzer liest historische_rangliste_soeder      -> nur rangliste_soeder-Zeilen
