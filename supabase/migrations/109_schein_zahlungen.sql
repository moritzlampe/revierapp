-- 109_schein_zahlungen.sql
-- Nativer Track, 06.08.2026. Setzt 079, 103, 104 und 105 voraus.
--
-- WOFUER
-- ------
-- Ein Journal der Zahlungseingaenge zu einem Begehungsschein. Moritz,
-- 05.08.2026: „wenn der aussteller das geld erhalten hat fuer den
-- begehungsschein kann er den zahlungseingang bestaetigen."
--
-- EINE TABELLE UND NICHT EINE SPALTE AM SCHEIN
-- --------------------------------------------
-- Das ist die Entscheidung, die den ganzen Entwurf traegt, und sie folgt
-- direkt aus 105. Dort hat der Schein ein `entgelt_intervall` bekommen —
-- jaehrlich, quartalsweise, monatlich. Bei „jaehrlich" gibt es nicht EINEN
-- Zahlungseingang, sondern jedes Jahr einen; bei „monatlich" zwoelf. Eine
-- Spalte `bezahlt_am` koennte den zweiten nicht festhalten, ohne den ersten zu
-- ueberschreiben.
--
-- Der zweite Grund steht im Kopf von 105 und ist der laengerfristige: „in der
-- Belegverwaltung haben wir irgendwann eine Konteneinbindung." Eine
-- Kontobewegung ordnet man einer ZAHLUNG zu, nicht einem Datum. Die Zeile ist
-- das, woran so etwas spaeter andocken kann.
--
-- DIE GRENZE AUS DEM 104-KOPF WIRD BEWUSST UEBERSCHRITTEN
-- -------------------------------------------------------
-- 104 und 105 haben zweimal geschrieben: „wann gezahlt wird" ist eine
-- Vereinbarung, „WURDE gezahlt" waere ein anderes Produkt. Diese Migration
-- macht genau den Schritt, den beide abgelehnt haben — auf Moritz'
-- ausdrueckliche Entscheidung vom 05.08.2026.
--
-- Was trotzdem draussen bleibt, und zwar unveraendert: keine Mahnung, keine
-- Erinnerung, keine Kontoanbindung, kein Jahresabschluss, kein Soll-Ist. Die
-- Tabelle beantwortet genau eine Frage — „was ist eingegangen" — und rechnet
-- nichts dagegen. Ob eine Zahlung FEHLT, sagt sie nicht; das braucht einen
-- Faelligkeitsplan aus `entgelt_intervall` + `entgelt_erste_zahlung`, und der
-- gehoert in die Ansicht, nicht in die Ablage.
--
-- **Aufs gedruckte Blatt gehoert der Zahlungseingang NICHT.** Der Schein wird
-- nach § 19 NJagdG Polizeibeamten vorgezeigt, und was ein Gast gezahlt hat,
-- geht die nichts an. Dieselbe Begruendung wie beim Entgelt-Haekchen in 104.
--
-- WER SCHREIBEN DARF — ABGESCHRIEBEN, NICHT ERFUNDEN
-- ---------------------------------------------------
-- Der REVIERBESITZER, ueber `districts.owner_id`. Das ist der Zuschnitt aus
-- 079, samt seiner Begruendung: dort wurde `kann_revier_pflegen()` ausdruecklich
-- verworfen, weil es seit 068 auch fuer Scheininhaber gilt — und ein
-- Scheininhaber darf keine Scheine vergeben, also erst recht keine Zahlungen an
-- ihnen bestaetigen. Auch nicht `issuer_id`: wem das Revier gehoert, der
-- verwaltet alle Scheine darin, das steht so im UPDATE-Absatz von 079.
--
-- Lesen darf zusaetzlich der INHABER. **Er** ist der, der gezahlt hat, und er
-- soll nachsehen koennen, was quittiert wurde. Das spiegelt
-- `hunting_licenses_holder` (SELECT, `holder_id = auth.uid()`).
--
-- VIER POLICIES JE KOMMANDO STATT EINER `for all`
-- ------------------------------------------------
-- Begruendung aus AGENTS.md und 079: eine `for all`-Policy prueft ihr USING
-- auch gegen die NEUE Zeile, ein eigener `with check` hebt das nicht auf.
-- Getrennt steht jede Bedingung genau dort, wo sie gelten soll.
--
-- Die Bedingungen stehen als Inline-Subqueries und NICHT als Funktion — genau
-- wie in 079, aus dem Grund, der in AGENTS.md steht: eine Funktion im
-- Policy-Ausdruck macht aus „0 Zeilen" ein `42501`, sobald die aufrufende Rolle
-- kein EXECUTE hat (077/078). `to authenticated` steht trotzdem dran, weil
-- `anon` die Bedingung ohnehin nie erfuellt.
--
-- Zu beachten beim Nachlesen: die Subqueries laufen SELBST unter RLS, denn
-- keine dieser Policies ruft eine SECURITY-DEFINER-Funktion. Ein Schein, den
-- der Aufrufer nicht sehen darf, existiert fuer diese Bedingungen nicht — das
-- ist gewollt und liegt auf derselben Linie wie der Invoker-Trigger aus 097:
-- ein Verweis auf eine fremde Zeile scheitert als „gibt es nicht", ohne deren
-- Existenz zu bestaetigen.
--
-- KEINE BERECHTIGUNG LEITET SICH AUS DIESER TABELLE AB
-- -----------------------------------------------------
-- Derselbe Riegel wie bei 101, 103 und 105, und er ist ein NICHT-TUN: keine
-- Policy irgendeiner anderen Tabelle darf `schein_zahlungen` auswerten. Waere
-- es anders, haette der Revierbesitzer eine Zeile in der Hand, aus der ein
-- Zugriff folgt — die Bauform, an der `hunts.wildart_ids` in 096 gescheitert
-- ist. Heute folgt daraus nichts; der Satz steht hier, damit es auch dann noch
-- nichts wird, wenn jemand spaeter „nur wer gezahlt hat" als Schranke einbauen
-- will. Diese Schranke gehoert an `hunting_licenses.status`, wo sie schon ist.
--
-- Gegenprobe fuer einen spaeteren Lauf (muss 0 Zeilen liefern):
--
--     select polname from pg_policy
--      where polrelid <> 'public.schein_zahlungen'::regclass
--        and (pg_get_expr(polqual, polrelid)      ilike '%schein\_zahlungen%'
--          or pg_get_expr(polwithcheck, polrelid) ilike '%schein\_zahlungen%');
--
-- EINE ZAHLUNG AN EINEM UNENTGELTLICHEN SCHEIN IST ERLAUBT — IN KAUF GENOMMEN
-- ---------------------------------------------------------------------------
-- **105 hat ausdruecklich verlangt, dass diese Frage beim naechsten Mal
-- gestellt wird, und das ist das naechste Mal.** Dort steht woertlich: „Ein
-- Constraint, der Spalten aufzaehlt, ist damit eine Stelle, die JEDE spaetere
-- Spalte derselben Familie mitpflegen muss. Das steht hier, weil es beim
-- naechsten Mal wieder auffallen muss." 105 hat `hunting_licenses_ohne_entgelt`
-- eigens neu gefasst, damit ein Schein mit `entgeltlich is not true` keine
-- Betrags-, Intervall- oder Terminangabe tragen kann.
--
-- 109 setzt sich darueber hinweg: an einem ausdruecklich UNENTGELTLICHEN Schein
-- laesst sich eine Zahlung eintragen. Das ist bewusst und aus drei Gruenden:
--
--   1. Ein CHECK kann es nicht — er sieht nur seine eigene Zeile, und
--      `entgeltlich` steht in einer anderen Tabelle. Es braeuchte einen
--      Trigger, also eine vierte Pruefstelle fuer eine Auskunft, aus der nichts
--      folgt.
--   2. Der Trigger waere zur HAELFTE blind: er muesste auch auf
--      `hunting_licenses` feuern, sonst schaltet man den Schein einfach
--      nachtraeglich auf unentgeltlich und der Widerspruch ist wieder da.
--      Zwei Trigger auf zwei Tabellen gegen einen Zustand, den niemand
--      auswertet.
--   3. Der Fall ist nicht immer falsch. Ein Schein wird unentgeltlich erteilt
--      und der Gast zahlt trotzdem etwas — fuer Wildbret, fuer die Nachsuche,
--      als Aufwandsersatz. Die Zeile waere dann richtig und der Riegel im Weg.
--      „Melden wird nie verhindert, nur ausgewiesen."
--
-- **Der Unterschied zu 105 ist der Ort des Widerspruchs:** dort stand die
-- Vereinbarung in DERSELBEN Zeile wie das Haekchen, hier steht die Quittung
-- woanders. Was 105 verhindert hat, war eine Zeile, die sich selbst
-- widerspricht; was 109 zulaesst, sind zwei Zeilen, die nicht zueinander
-- passen — und dafuer ist die Ansicht zustaendig, nicht die Ablage.
--
-- `hunting_license_id` WIRD NICHT FESTGEHALTEN
-- ---------------------------------------------
-- Anders als die drei Spalten aus 087, und aus demselben Grund wie
-- `kontakt_id` in 106: daran haengt keine Berechtigung, nur eine Zuordnung. Wer
-- eine Zahlung am falschen Schein eintraegt, soll sie umhaengen koennen, statt
-- loeschen und neu anlegen zu muessen. Das UPDATE traegt USING **und** WITH
-- CHECK auf dieselbe Bedingung — umhaengen geht damit nur auf einen Schein im
-- EIGENEN Revier, nie aus dem Revier heraus. Dieselbe Konstruktion wie
-- `hunting_licenses_issuer_update` in 079.
--
-- `on delete cascade` — UND WAS DAHINTER LIEGT
-- ---------------------------------------------
-- Bei NO ACTION waere ein Schein mit Zahlungen nicht mehr loeschbar — die
-- A-J2-Bauform, aber ohne deren Rechtfertigung: am Revier haengen Erlegungen,
-- die eine behoerdliche Streckenmeldung tragen, am Schein haengt eine
-- Quittung. Und der Schein hat mit `jes_status` bereits einen Weg, ihn
-- stillzulegen statt zu loeschen (`pausiert`, `entzogen`); wer ihn wirklich
-- loescht, will ihn los.
--
-- **DIE KETTE IST ABER LAENGER ALS EINE STUFE, UND DAS HAT DER ERSTE ENTWURF
-- NICHT HINGESCHRIEBEN.** An der Produktion gemessen (06.08.2026):
--
--     schein_zahlungen.hunting_license_id -> hunting_licenses  ON DELETE CASCADE  (neu, hier)
--     hunting_licenses.district_id        -> districts         ON DELETE CASCADE  (bestand schon)
--
-- **Ein `delete from districts` loescht damit die Scheine UND, ab 109, jede
-- Zahlung daran — zwei Ebenen tief, ohne dass jemand einen Schein bewusst
-- anfasst.** Das ist kein gedachter Pfad: am 04.08.2026 sind in diesem Projekt
-- sieben Reviere geloescht worden. Wer das naechste Mal Anker 2 fuer eine
-- Loeschung durchgeht, muss diese Ebene kennen — deshalb steht sie hier und in
-- den Gegenproben unten, nicht nur im Fremdschluessel.
--
-- **Trotzdem bleibt CASCADE, und der Grund ist eine Verhaeltnismaessigkeit:**
-- 109 fuegt keine Loeschgefahr hinzu, die es nicht schon gibt. Wer heute ein
-- Revier loescht, verliert bereits den Schein selbst — samt `entgelt_betrag`
-- und `entgelt_intervall` aus 104/105, also der Vereinbarung, zu der die
-- Zahlung nur die Quittung ist. Die Quittung ist nicht schutzbeduerftiger als
-- das, worauf sie sich bezieht. Und die Richtung ist mit A-J2 bereits
-- entschieden: **Soft-Delete am Revier**, nicht ein weiterer NO-ACTION-Riegel,
-- der das Loeschen von aussen blockiert. Ein NO ACTION hier machte ein Revier
-- mit Zahlungen unloeschbar, obwohl es heute loeschbar ist — eine
-- Verhaltensaenderung an einer bestehenden Flaeche, aus einer neuen Tabelle
-- heraus.
--
-- **SET NULL waere gar nicht erst moeglich**, und die frueheren Zeilen hier
-- behaupteten das Gegenteil: `hunting_license_id` ist NOT NULL, ein Loeschen
-- scheiterte an `23502`, es entstuende keine unsichtbare Waise. Die Begruendung
-- galt nur, wenn man NOT NULL gleich mit fallen liesse — das stand nirgends.
-- Die Schlusslesung vom 06.08.2026 hat es gefunden; der Satz ist korrigiert
-- statt gestrichen, weil die naechste Tabelle dieselbe Wahl hat.
--
-- KEIN RIEGEL GEGEN EIN ZUKUENFTIGES `erhalten_am`
-- -------------------------------------------------
-- **Das tragende Argument steht zuerst, weil der erste Entwurf es zuletzt
-- hatte:** ein zukuenftiges Datum ist eine Auskunft, kein Schaden. Niemand
-- leitet etwas daraus ab (s. der Nicht-Tun-Riegel oben), und ein Riegel machte
-- aus einem Vertipper einen Fehlschlag beim Speichern — die Zeile waere danach
-- gar nicht erfasst. Dieselbe Haltung wie 105 bei `entgelt_erste_zahlung` und
-- dieselbe wie die Projektregel „Melden wird nie verhindert, nur ausgewiesen".
--
-- **Das zweite Argument ist schwaecher, und es ist wichtig zu wissen, warum:**
-- der naheliegende `check (erhalten_am <= current_date)` waere falsch, weil die
-- Datenbank auf UTC laeuft und Berlin ihr voraus ist. Um 00:30 Berliner Zeit am
-- 7. August ist es in UTC erst 22:30 am 6. — `current_date` sagt also den 6.,
-- waehrend der Mensch vor dem Formular „heute" liest und den 7. eintraegt.
--
-- **Das Fenster ist aber nicht das ganze Jahr gleich gross, und der erste
-- Entwurf schrieb es als Jahreswert hin** (beide Prueflaeufe vom 06.08.2026
-- fanden es unabhaengig voneinander):
--
--     Sommerzeit (CEST, +02:00):  00:00 bis 02:00 Ortszeit
--     Winterzeit (CET,  +01:00):  00:00 bis 01:00 Ortszeit
--
-- Gegengerechnet: 15.01.2026 00:30 Berlin = 14.01. 23:30 UTC. **Vierte
-- Wiederholung derselben Falle in diesem Repo** — 03.08. eine Zusicherung neben
-- der Grenze, 04.08. eine Zahl neben der Grenze, 06.08. eine Zeitspanne ohne
-- den Umstellungstag, hier ein Fenster ohne die Umstellung.
--
-- **Und es widerlegt nur `current_date`, nicht jeden Riegel.** 087 zeigt im
-- selben Atemzug die richtige Form: `(now() at time zone 'Europe/Berlin')::date`
-- haette die Falle gar nicht. Wer diesen Absatz spaeter als „ein Riegel geht
-- hier nicht" liest, liest ihn falsch — er geht, er lohnt nur nicht.
--
-- WAS DIE DATEI NICHT ANLEGT
-- ---------------------------
-- Kein `updated_at` und kein Trigger dafuer: eine Zahlungszeile wird angelegt
-- und selten korrigiert, und `created_at` beantwortet die Frage, die man
-- wirklich hat („wann wurde das quittiert" — eine andere als `erhalten_am`).
-- Kein Index auf dem Fremdschluessel: bei 4 Scheinen im Bestand ist er Zierde,
-- und er kostet spaeter ein `create index`. Keine Funktion, keine Aenderung an
-- einer bestehenden Policy.
--
-- **Kein `erfasst_von`, und das ist die Auslassung mit der kuerzesten
-- Haltbarkeit** (Schlusslesung 06.08.2026): die Tabelle heisst Journal und
-- traegt eine Quittung, aber keine Zeile weiss, WER quittiert hat. Solange ein
-- Revier genau einen Besitzer hat, ist das folgenlos — `districts.owner_id` ist
-- die Antwort. Wechselt ein Revier den Besitzer, sieht und loescht der neue
-- alle Zahlungen des alten, und niemand kann mehr sagen, wer sie gebucht hat.
-- Faellig, wenn ein Revier zum ersten Mal uebergeben wird; heute gibt es
-- projektweit zwei Reviere mit demselben Besitzer.
--
-- **Kein `grant`, und dazu gehoert eine Ansage.** Supabase vergibt die Rechte
-- fuer neue Tabellen in `public` per `alter default privileges`; an 085
-- (`kontakte`) und 096 (`wildarten`) gemessen, die ebenfalls keins setzen, hat
-- `anon` dort SELECT — deshalb liefert die Gegenprobe unten eine Zahl und
-- keinen Fehler. Eine Fremdpruefung hat am 06.08.2026 darauf hingewiesen, dass
-- Supabase diese Voreinstellung umstellt (neue Projekte seit Mai 2026,
-- bestehende im Oktober 2026). **Der Einwand stimmt und gehoert trotzdem nicht
-- in diese Datei:** die Umstellung traefe alle Tabellen des Projekts
-- gleichzeitig, nicht diese eine. Ein Grant nur hier waere eine Insel, die
-- niemanden rettet und beim naechsten Lesen wie eine Sonderregel aussieht. Der
-- Punkt liegt im Backlog, projektweit.
--
-- `notiz` STEHT DAGEGEN DRIN, UND ZWAR WEIL SIE BESTELLT IST. Die Ponytail-
-- Lesung vom 06.08.2026 wollte sie streichen (niemand liest sie, kein Client
-- existiert) — sie steht namentlich in Moritz' Spaltenliste zu A-B0 im Backlog.
-- Der Unterschied zum weggelassenen Index ist genau dieser: der Index war meine
-- Idee, die Notiz ist seine. Was bestellt wurde, wird nicht wegvereinfacht.
--
-- IDEMPOTENZ — GANZ ODER GAR NICHT
-- ---------------------------------
-- `create policy` kennt kein `if not exists`. Ohne die vier `drop policy if
-- exists` unten waere `create table if not exists` oben ein leeres Versprechen:
-- der zweite Lauf stuerbe an `duplicate_object`, waehrend die erste Zeile
-- Wiederholbarkeit behauptet. **079 hat denselben Befund vor dem Applizieren
-- kassiert** (Codex, 31.07.2026, im Trockenlauf) — die Migration ist NICHT
-- daran gescheitert, sie haette es beim zweiten Lauf. Der Unterschied ist
-- wichtig genug fuer eine eigene Zeile, weil spaetere Dateien so etwas
-- weiterzitieren; ein erfundenes Ereignis stand hier schon einmal und wurde von
-- der Schlusslesung am 06.08.2026 gefunden.
--
-- Was diese Datei NICHT leistet, obwohl „idempotent" danach klingt: sie stellt
-- den Sollzustand nicht her. Eine bereits bestehende `schein_zahlungen` bekaeme
-- weder eine fehlende Spalte noch den CHECK nachgereicht — sie laeuft nur
-- durch.
--
-- Bestand bei Anlage (gemessen 06.08.2026): 4 Scheine, davon 1 entgeltlich mit
-- Betrag und Intervall, 1 eingeloest. `schein_zahlungen` existiert nicht.

create table if not exists public.schein_zahlungen (
  id                 uuid primary key default gen_random_uuid(),
  hunting_license_id uuid not null
                     references public.hunting_licenses(id) on delete cascade,
  betrag             numeric(10,2) not null,
  erhalten_am        date not null,
  notiz              text,
  created_at         timestamptz not null default now(),

  -- Eine Zahlung ueber 0 ist keine, eine negative waere eine Rueckzahlung —
  -- und die ist ein anderes Produkt (s. „Grenze" oben). Ein Storno ist hier
  -- das Loeschen der Zeile; das darf der Revierbesitzer.
  --
  -- **`betrag > 0` ALLEIN GENUEGT NICHT, UND DAS IST DIE UEBERRASCHUNG DES
  -- TAGES:** Postgres haelt `NaN` fuer GROESSER als jeden endlichen Wert, also
  -- ist `'NaN'::numeric > 0` wahr (gemessen, PG 17.6). Ueber PostgREST genuegt
  -- `{"betrag":"NaN"}`, und danach ist jede `sum(betrag)` unbrauchbar — also
  -- genau die Konteneinbindung, fuer die Moritz die Tabelle will. Beide
  -- Prueflaeufe vom 06.08.2026 fanden es unabhaengig voneinander.
  --
  -- **Der Zusatz wirkt, aber aus dem umgekehrten Grund, den man vermutet:**
  -- Postgres definiert `NaN = NaN` als WAHR (anders als IEEE 754, wo NaN sich
  -- selbst ungleich ist). `NaN <> NaN` ist hier also FALSCH — der CHECK-Ausdruck
  -- wird falsch und die Zeile prallt ab. Wer den IEEE-Reflex hat, haelt diese
  -- Zeile fuer wirkungslos; sie ist es nicht. Gemessen, nicht angenommen.
  --
  -- `Infinity` braucht keinen eigenen Zweig: `numeric(10,2)` kann es nicht
  -- darstellen, der Cast wirft vorher `22003`.
  constraint schein_zahlungen_betrag_positiv
    check (betrag > 0 and betrag <> 'NaN'::numeric)
);

comment on table public.schein_zahlungen is
  'Journal der Zahlungseingaenge zu einem Begehungsschein (109, 06.08.2026). Eine '
  'Zeile je Eingang, weil entgelt_intervall aus 105 wiederkehrende Zahlungen kennt. '
  'Beantwortet NUR "was ist eingegangen" — nicht, ob etwas fehlt: kein Soll, keine '
  'Mahnung, keine Kontoanbindung. KEIN Berechtigungstraeger; keine Policy einer '
  'anderen Tabelle darf diese hier auswerten.';

comment on column public.schein_zahlungen.erhalten_am is
  'Wann das Geld beim Aussteller eingegangen ist — vom Menschen erfasst, bewusst OHNE '
  'Riegel gegen die Zukunft: die DB laeuft auf UTC, ein Vergleich mit current_date '
  'wiese ein um 00:30 Berliner Zeit getipptes "heute" ab (dieselbe Falle wie in 087).';

comment on column public.schein_zahlungen.notiz is
  'Freitext des Revierbesitzers zur Zahlung. ACHTUNG: der Scheininhaber liest die '
  'Zeile mit (schein_zahlungen_select) und damit auch dieses Feld — es ist KEIN '
  'interner Vermerk. Wer "dritte Mahnung" hineinschreibt, hat es dem Gast vorgelesen.';

comment on column public.schein_zahlungen.created_at is
  'Wann die Zahlung erfasst wurde — eine andere Angabe als erhalten_am, die sagt, wann '
  'das Geld kam. KEIN Nachweis: der Default greift nur, wenn der Aufrufer die Spalte '
  'auslaesst, und der Revierbesitzer kann sie per INSERT setzen und per UPDATE aendern. '
  'Wie inaktiv_seit in 100 bewusst nicht per Trigger festgehalten — daran haengt keine '
  'Berechtigung. Faellig, wenn der Zeitpunkt eine Auskunft an Dritte wird.';

alter table public.schein_zahlungen enable row level security;

-- Vorsorglich: `create policy` kennt kein `if not exists`. Ohne diese vier
-- Zeilen verspraeche `create table if not exists` oben eine Wiederholbarkeit,
-- die die Datei zwei Absaetze spaeter wieder einreisst — Schutz, der nicht
-- schuetzt. Gegen eine frische Datenbank faellt so etwas nie auf, weil dort
-- nichts existiert, was kollidieren koennte.
drop policy if exists schein_zahlungen_select on public.schein_zahlungen;
drop policy if exists schein_zahlungen_insert on public.schein_zahlungen;
drop policy if exists schein_zahlungen_update on public.schein_zahlungen;
drop policy if exists schein_zahlungen_delete on public.schein_zahlungen;

-- ---------------------------------------------------------------------------
-- SELECT — Revierbesitzer ODER Scheininhaber
-- ---------------------------------------------------------------------------
-- Der Inhaber ist der, der gezahlt hat; er soll nachsehen koennen, was
-- quittiert wurde. Sein Zweig prueft nur `holder_id`, kein Datum — ein
-- abgelaufener oder gesperrter Schein bleibt fuer ihn lesbar, genau wie in
-- `hunting_licenses_holder`.
create policy schein_zahlungen_select on public.schein_zahlungen
  for select
  to authenticated
  using (
    hunting_license_id in (
      select hl.id from public.hunting_licenses hl
       where hl.holder_id = auth.uid()
          or hl.district_id in (
               select d.id from public.districts d where d.owner_id = auth.uid()
             )
    )
  );

-- ---------------------------------------------------------------------------
-- INSERT — nur der Revierbesitzer, nur an einen Schein seines Reviers
-- ---------------------------------------------------------------------------
-- Die naechsten DREI Praedikate (insert, update-using, update-with-check,
-- delete) sind ZEICHENGLEICH. Das ist Absicht: Kopien eines
-- Sicherheitsausdrucks sind die „eine aendern, drei vergessen"-Falle, und
-- zeichengleich ist sie wenigstens per `grep -c` sichtbar. Eine Funktion daraus
-- zu machen waere der naheliegende Ausweg und ist hier der falsche — s. den
-- Absatz „Vier Policies" im Kopf (077/078).
--
-- **Die SELECT-Policy oben ist bewusst NICHT zeichengleich und wird von diesem
-- `grep` nicht mitgezaehlt** (Schlusslesung 06.08.2026): sie traegt den
-- zusaetzlichen `holder_id`-Zweig und drueckt den gemeinsamen Teil deshalb als
-- verschachteltes `in (select …)` statt als JOIN aus. Beide Formen sind
-- gleichwertig — `hunting_licenses.district_id` ist NOT NULL, `districts.id`
-- ist PK, RLS wirkt in beiden identisch —, aber wer die Regel aendert, muss an
-- VIER Stellen, nicht an drei.
create policy schein_zahlungen_insert on public.schein_zahlungen
  for insert
  to authenticated
  with check (
    hunting_license_id in (
      select hl.id from public.hunting_licenses hl
       join public.districts d on d.id = hl.district_id
      where d.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE — Betrag, Datum, Notiz korrigieren; auch umhaengen, aber nur intern
-- ---------------------------------------------------------------------------
-- USING und WITH CHECK tragen denselben Ausdruck aus dem Grund, den 079
-- ausschreibt: ohne den WITH CHECK liesse sich eine Zahlung auf einen Schein in
-- einem FREMDEN Revier umhaengen.
create policy schein_zahlungen_update on public.schein_zahlungen
  for update
  to authenticated
  using (
    hunting_license_id in (
      select hl.id from public.hunting_licenses hl
       join public.districts d on d.id = hl.district_id
      where d.owner_id = auth.uid()
    )
  )
  with check (
    hunting_license_id in (
      select hl.id from public.hunting_licenses hl
       join public.districts d on d.id = hl.district_id
      where d.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- DELETE — zuruecknehmen; zugleich der Weg fuer einen Storno
-- ---------------------------------------------------------------------------
create policy schein_zahlungen_delete on public.schein_zahlungen
  for delete
  to authenticated
  using (
    hunting_license_id in (
      select hl.id from public.hunting_licenses hl
       join public.districts d on d.id = hl.district_id
      where d.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Gegenproben nach dem Anwenden (jede mit ROLLBACK, Bestand vorher = nachher)
-- ---------------------------------------------------------------------------
--   Revierbesitzer traegt Zahlung an eigenem Schein ein   -> 1 Zeile
--   Inhaber liest sie                                      -> 1 Zeile
--   Inhaber traegt selbst eine ein                         -> 42501
--   Fremder mit bekannter Schein-id traegt ein             -> 42501
--   Fremder liest                                          -> 0 Zeilen
--   Erfundene hunting_license_id                           -> 42501
--   Umhaengen auf eigenen zweiten Schein                   -> geht
--   Umhaengen auf fremden Schein                           -> 42501 (with check wirft)
--   betrag = 0 und betrag < 0                              -> 23514
--   betrag = 'NaN'                                         -> 23514  (der Zusatz)
--   betrag = 0.001                                         -> 23514  (Typmod rundet VOR dem CHECK)
--   Schein loeschen                                        -> Zahlungen gehen mit
--   REVIER loeschen                                        -> Scheine UND Zahlungen gehen mit,
--                                                             zwei Ebenen tief (die Kaskade,
--                                                             die der erste Entwurf verschwieg)
--   anon: select count(*) from schein_zahlungen            -> Zahl, kein Fehler
--   0 Policies anderer Tabellen werten schein_zahlungen aus
