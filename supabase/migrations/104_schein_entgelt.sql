-- 104_schein_entgelt.sql
-- Nativer Track, 05.08.2026. Ergaenzt 103, **nie ohne 103 lesen**.
--
-- WOFUER
-- ------
-- `hunting_licenses.entgelt_betrag` und `entgelt_faellig` — was der Inhaber
-- zahlt und wann. 103 hat nur den Schalter gebracht; „entgeltlich" allein ist
-- ein halber Satz, und wer im Maerz wissen will, wer was zahlt, hatte nichts.
--
-- Moritz, 05.08.2026: „wir sollten den betrag und faelligkeit mit aufnehmen und
-- dann beim blat drucken rechts noch ankreuzen koennen wenn betrag und
-- faelligkeit mit ausgedruckt werden soll."
--
-- RECHTLICH NICHT NOETIG — UND DAS IST DER GRUND FUER DEN ZUSCHNITT
-- -----------------------------------------------------------------
-- § 20 Nr. 5 NJagdG verlangt vom EMPFAENGER nur anzugeben, DASS eine
-- entgeltliche Erlaubnis besteht und welche Flaeche anteilig auf ihn entfaellt
-- — nicht den Betrag. § 11 Abs. 3 BJagdG rechnet Hektar, nicht Euro.
--
-- Diese Spalten dienen also dem Menschen, nicht der Behoerde.
--
-- `numeric(10,2)`, NICHT `float`
-- ------------------------------
-- Bei Geld der klassische Fehler — und er steht bereits im Repo: die tote
-- Prototyp-Tabelle `jes` aus Migration 001 traegt `betrag float` (Zeile 70).
-- Diese Migration ist die Gelegenheit, den Fehler nicht zu wiederholen.
--
-- **ZWEI CHECKs, und der erste Entwurf hatte KEINEN — das war der Fehler**
-- (Fremdpruefung 05.08.2026, M5 und S9). Er argumentierte, der einzige
-- Schreibweg sei das Portal und ein Constraint waere ein zweiter Ort fuer
-- dieselbe Regel. Beides haelt nicht:
--
-- Der Schreibweg im Portal ist ein FREITEXT-Feld (`inputMode="decimal"` ist
-- eine Bitte an die Tastatur, kein Riegel), Negatives faellt allein an einer
-- Regex im Client durch — wer per `curl` schreibt, traegt `-20` ein. Und
-- „zweiter Ort" beschreibt den Fall falsch: der Client formt eine EINGABE,
-- der CHECK sichert eine INVARIANTE. Das ist nicht dieselbe Regel zweimal,
-- sondern Bequemlichkeit und Wahrheit an ihren jeweiligen Plaetzen.
--
-- Was daran haengt, ist kein Schoenheitsfehler: diese Werte kommen auf ein
-- Blatt, das zwei Menschen unterschreiben.
--
-- DIE FAELLIGKEIT IST FREITEXT UND KEIN `date`
-- --------------------------------------------
-- Das ist die Entscheidung, an der man sich vertut. Der Normalfall ist
-- WIEDERKEHREND — „jaehrlich zum 1. April", „einmalig bei Uebergabe", „zum Ende
-- des Jagdjahres". Ein `date` erzwaenge einen einzigen Tag und koennte den
-- haeufigsten Fall gar nicht ausdruecken.
--
-- **Preis, benannt:** nichts erinnert, nichts sortiert, nichts summiert sich
-- nach Faelligkeit. Genau das ist die Grenze zur Buchhaltung, die hier bewusst
-- draussen bleibt: „wann gezahlt wird" ist eine Vereinbarung, „WURDE gezahlt"
-- waere ein anderes Produkt — Mahnung, Quittung, Jahresabschluss. Ein echtes
-- Datum kommt, wenn jemand Erinnerungen will, und dann zusammen mit seinem
-- Leser. (Dieselbe Haltung wie bei `kills.trichinen_pflicht` in 096: ein Feld
-- ohne Leser wird nicht auf Verdacht gebaut.)
--
-- WARUM ZWEI SPALTEN UND NICHT `auflagen`
-- ---------------------------------------
-- `auflagen` traegt Jagdbedingungen („kein Rotwild, Ansitz nur mit Absprache")
-- und steht auf dem mitgefuehrten Blatt — dort, wo ein Beamter mitliest. Geld
-- gehoert nicht in dasselbe Feld: es soll getrennt ein- und ausblendbar sein
-- (s. unten), und ein Betrag im Freitext liesse sich spaeter weder auslesen
-- noch anzeigen. Der Preis von zwei Spalten ist eine Zeile DDL.
--
-- WAS DEN AUSDRUCK ANGEHT — UND WARUM ES KEINE SPALTE DAFUER GIBT
-- ---------------------------------------------------------------
-- Ob Betrag und Faelligkeit auf dem Papier erscheinen, entscheidet ein
-- Haekchen im Druckdialog, **nicht** ein gespeicherter Wert. Das ist Absicht:
-- derselbe Schein dient ohne Haekchen als mitgefuehrter Nachweis nach
-- § 19 NJagdG (dort geht der Preis niemanden etwas an) und mit Haekchen als
-- unterschriebene Vereinbarung zwischen zwei Menschen. Eine Spalte
-- `entgelt_drucken boolean` waere eine gespeicherte Antwort auf eine Frage,
-- die sich bei jedem Ausdruck neu stellt.
--
-- DER RIEGEL IST DERSELBE WIE BEI 103
-- -----------------------------------
-- **KEINE Policy darf diese Spalten auswerten.** Diese Migration legt ausser
-- den zwei Spalten nichts an: kein Trigger, keine Funktion, kein Grant, kein
-- Index, keine Policy-Aenderung. Die vier Policies aus 079 tragen sie
-- unveraendert — setzen und korrigieren darf sie der Revierbesitzer
-- (`hunting_licenses_issuer_update`, USING und WITH CHECK auf
-- `districts.owner_id`), lesen zusaetzlich der Inhaber
-- (`hunting_licenses_holder`). Letzteres ist gewollt: **er** ist der, der
-- zahlt.
--
-- Gegenprobe fuer einen spaeteren Lauf (muss 0 Zeilen liefern):
--
--     select polname from pg_policy
--      where pg_get_expr(polqual, polrelid) ilike '%entgelt\_%'
--         or pg_get_expr(polwithcheck, polrelid) ilike '%entgelt\_%';
--
-- Kein Trigger haelt die Spalten fest — an ihnen haengt keine Berechtigung,
-- nur eine Auskunft, und Korrektur ist der Normalfall (dieselbe Begruendung
-- wie bei `entgeltlich` in 103).
--
-- NULLABLE, UND ZWAR BEIDE
-- ------------------------
-- Ein unentgeltlicher Schein hat weder Betrag noch Faelligkeit; ein
-- entgeltlicher kann eine Vereinbarung haben, die noch nicht feststeht.
-- **Kein CHECK, der bei `entgeltlich = true` einen Betrag ERZWINGT** — das
-- Portal fuehrt die Felder ohnehin nur dann, und ein Constraint machte aus
-- einer offenen Absprache einen Fehlschlag beim Speichern. Melden wird nie
-- verhindert, nur ausgewiesen; dasselbe gilt fuers Erfassen.
--
-- Die umgekehrte Richtung ist sehr wohl gesichert (s. `_ohne_entgelt` unten):
-- ein Betrag DARF fehlen, aber er darf nicht an einem Schein haengen, der
-- ausdruecklich unentgeltlich ist.
--
-- Bestand bei Anlage: 4 Scheine, 0 mit `entgeltlich` gesetzt (gemessen
-- 05.08.2026, nach 103). Alle vier erfuellen beide CHECKs, weil beide neuen
-- Spalten `NULL` sind.
--
-- **Der zweite CHECK macht die Abhaengigkeit von 103 mechanisch**, und das ist
-- ein Nebeneffekt, den der erste Entwurf nicht hatte: er nennt `entgeltlich`,
-- also scheitert diese Datei beim Replay, wenn 103 fehlt. Vorher stand die
-- Warnung „nie ohne 103 lesen" nur im Kommentar und niemand haette sie
-- durchgesetzt.

alter table public.hunting_licenses
  add column if not exists entgelt_betrag numeric(10,2),
  add column if not exists entgelt_faellig text;

comment on column public.hunting_licenses.entgelt_betrag is
  'Was der Inhaber fuer die Jagderlaubnis zahlt, in Euro. numeric statt float, weil '
  'Geld. NULL heisst "kein Betrag hinterlegt" — auch bei entgeltlich = true zulaessig, '
  'eine Absprache muss nicht feststehen. Reine Auskunft, KEIN Berechtigungstraeger.';

comment on column public.hunting_licenses.entgelt_faellig is
  'Wann gezahlt wird, als FREITEXT ("jaehrlich zum 1. April", "einmalig bei '
  'Uebergabe"). Bewusst kein date: der Normalfall ist wiederkehrend. Folge: keine '
  'chronologische Sortierung und keine Erinnerung — ob gezahlt WURDE, haelt QuickHunt '
  'nicht fest.';

-- Ein Betrag darf fehlen, aber nicht negativ sein. Der Client weist Negatives
-- schon an der Regex ab; dieser CHECK gilt auch fuer den, der direkt schreibt.
alter table public.hunting_licenses
  drop constraint if exists hunting_licenses_entgelt_betrag_nicht_negativ;
alter table public.hunting_licenses
  add constraint hunting_licenses_entgelt_betrag_nicht_negativ
  check (entgelt_betrag is null or entgelt_betrag >= 0);

-- **Der wichtigere der beiden.** Ein ausdruecklich UNENTGELTLICHER Schein darf
-- kein Entgelt tragen — und `entgeltlich IS NULL` (der Altbestand, der beide
-- Woerter zum Streichen stehen laesst) genauso wenig.
--
-- Rueckwaerts gelesen: ist `entgeltlich` NICHT `true`, muss beides `NULL`
-- sein. **`is true` und nicht `= true`**, weil ein Vergleich mit NULL selbst
-- NULL ergibt — und ein CHECK gilt als erfuellt, wenn sein Ausdruck NULL ist.
-- `entgeltlich = true or (...)` liesse den Altbestand also stillschweigend
-- durch, genau den Fall, gegen den dieser Riegel steht.
alter table public.hunting_licenses
  drop constraint if exists hunting_licenses_ohne_entgelt;
alter table public.hunting_licenses
  add constraint hunting_licenses_ohne_entgelt
  check (
    entgeltlich is true
    or (entgelt_betrag is null and entgelt_faellig is null)
  );
