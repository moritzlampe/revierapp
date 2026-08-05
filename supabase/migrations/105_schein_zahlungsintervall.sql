-- 105_schein_zahlungsintervall.sql
-- Nativer Track, 05.08.2026. Setzt 103 und 104 voraus, **nie ohne beide lesen**.
--
-- WOFUER
-- ------
-- `hunting_licenses.entgelt_intervall` und `entgelt_erste_zahlung` — wie oft
-- gezahlt wird und wann zum ersten Mal. Zusammen loesen sie `entgelt_faellig`
-- aus 104 ab, das den Rhythmus als FREITEXT trug („jaehrlich zum 1. April").
--
-- Moritz, 05.08.2026, nach dem ersten Blick auf die Druckansicht: „ein
-- zahlungsintervall sollte dabei auswaehlbar sein, voreingestellt auf
-- jaehrlich. (jaehrlich, quartalsweise, monatlich. das faelligkeitsfenster wird
-- dann: Erste Zahlung am."
--
-- WARUM EINEN TAG NACH 104, UND WARUM DAS KEIN FEHLER IST
-- -------------------------------------------------------
-- 104 hat den Freitext mit einer ausdruecklichen Bedingung gewaehlt: „Ein
-- echtes Datum kommt, wenn jemand Erinnerungen will, und dann zusammen mit
-- seinem Leser." Die Bedingung ist eingetreten, und zwar mit Begruendung
-- (Moritz, 05.08.2026):
--
--   „in der Belegverwaltung haben wir irgendwann eine Konteneinbindung. so
--    verbauen wir uns erstmal nichts, evtl ergaenzen wir so etwas spaeter
--    ueber eine api oder direkt."
--
-- Das ist der Grund, warum die STRUKTUR jetzt stimmen muss und nicht erst,
-- wenn jemand sie braucht: ein Freitext „jaehrlich zum 1. April" laesst sich
-- keiner Kontobewegung zuordnen, ein Intervall plus Startdatum sehr wohl. Der
-- Freitext war nicht falsch — er war die richtige Antwort auf die Frage von
-- gestern, als es keinen Leser gab.
--
-- `text` MIT CHECK UND NICHT ALS ENUM
-- -----------------------------------
-- Das Schema fuehrt Enums (`jes_status`, `participant_tag`), und Konsistenz
-- spraeche dafuer. Sie tragen aber Berechtigungen und stehen in Policies;
-- diese Spalte traegt eine Auskunft und steht in keiner.
--
-- Entscheidend ist der Preis der Erweiterung: `alter type … add value` ist in
-- Postgres nicht ruecknehmbar und lief bis PG12 nicht einmal in einer
-- Transaktion, ein CHECK dagegen ist drop-and-recreate. „Halbjaehrlich"
-- kostet damit eine Zeile statt eines Typ-Eingriffs — und dass jemand ein
-- viertes Intervall will, ist wahrscheinlicher als bei einem Statuswert, an
-- dem Zugriffsrechte haengen.
--
-- NULLABLE, BEIDE
-- ---------------
-- Die vier Bestandsscheine haben weder das eine noch das andere, und ein
-- `default 'jaehrlich'` behauptete ueber sie eine Vereinbarung, die niemand
-- getroffen hat — derselbe Fehler, den 103 bei `entgeltlich` vermieden hat.
-- Die Voreinstellung „jaehrlich" gehoert ins FORMULAR, wo ein Mensch sie sieht
-- und aendern kann, nicht in die Spalte.
--
-- **Kein CHECK, der ein Intervall ERZWINGT, wenn ein Betrag steht** — aus
-- demselben Grund wie in 104: eine Absprache muss nicht feststehen. Melden
-- wird nie verhindert, nur ausgewiesen; dasselbe gilt fuers Erfassen.
--
-- **Die Gegenrichtung ist sehr wohl gesichert: ein Intervall OHNE Betrag ist
-- verboten** (`_intervall_braucht_betrag`). Der Grund ist ein Befund der
-- Fremdpruefung (Codex P1, 05.08.2026): der Client zeigt ein Intervall nur
-- neben einem Betrag an — „jaehrlich" allein beantwortet keine Frage, die
-- jemand hat, und stammt im Zweifel aus der Formular-Voreinstellung, die
-- niemand angefasst hat. Ohne den CHECK erlaubte die Datenbank aber genau
-- diese Zeile, und ein anderer oder spaeterer Schreiber koennte eine
-- Vereinbarung ablegen, **die auf dem unterschriebenen Blatt nie erscheint.**
--
-- Client-Regel und DB-Invariante liefen damit auseinander, und von den beiden
-- moeglichen Angleichungen ist diese die richtige: ein gespeicherter Wert, den
-- keine Ansicht zeigt, ist schlimmer als ein verbotener Zustand. Fuer die
-- Kontenzuordnung, fuer die Moritz die Spalte will, ist ein erfundenes
-- Intervall ohnehin schlechter als keins.
--
-- **Keine Plausibilitaetsgrenze auf `entgelt_erste_zahlung`**, weder gegen die
-- Vergangenheit noch gegen `valid_from`/`valid_until`. Eine Anzahlung vor
-- Beginn der Gueltigkeit ist ueblich, eine erste Zahlung nach deren Ende
-- (Abrechnung am Saisonende) ebenso. Ein Riegel machte aus einer normalen
-- Vereinbarung einen Fehlschlag beim Speichern.
--
-- `entgelt_faellig` BLEIBT STEHEN — UND WIRD STILLGELEGT
-- ------------------------------------------------------
-- Moritz, 05.08.2026: „am einfachsten ist stehen lassen." 0 Zeilen tragen
-- einen Wert, und ein `drop column` waere die eine Sache, die die Projektregel
-- „immer additiv und rueckwaertskompatibel" ausschliesst (AGENTS.md,
-- „Migrationen").
--
-- **Stehenlassen allein genuegt aber nicht, und das ist der Fund zweier
-- unabhaengiger Prueflaeufe** (Codex P1 und P2, 05.08.2026 — beide fanden ihn
-- getrennt voneinander, was ihn zum staerksten Befund des Tages macht).
--
-- Der erste Entwurf liess den Client die Spalte nur noch auf `NULL` schreiben
-- und begruendete das im Kommentar mit: „kein Client kann ihr je wieder einen
-- Wert geben." **Dieser Satz war an der Deployment-Grenze falsch.** Zwischen
-- dem Applizieren dieser Migration und dem Ausrollen des neuen Bundles — und
-- danach, solange irgendwo ein Tab mit dem alten Bundle offensteht — kann der
-- 104-Client sehr wohl eine Faelligkeit schreiben. Der neue Client laedt sie
-- nicht, vergleicht sie nicht und ueberschreibt sie beim naechsten Speichern
-- mit `NULL`: **eine Zahlungsabrede verschwindet lautlos.**
--
-- Der naheliegende Ausweg waere, die Spalte im Client weiter mitzuschleppen —
-- laden, in `basis`, in den React-Key, in den Compare-and-Swap. Das sind sechs
-- Zeilen Verkabelung fuer eine Spalte, die niemand mehr sehen soll, und sie
-- machen aus „abgeloest" wieder „halb in Betrieb".
--
-- **Der Riegel gehoert stattdessen dorthin, wo die Behauptung wahr wird:**
-- `check (entgelt_faellig is null)`. Damit prallt der Schreibversuch des alten
-- Tabs mit `23514` ab — laut, sofort und an der Quelle, statt spaeter still im
-- neuen Client. Nichts geht verloren, weil nichts mehr geschrieben werden
-- kann. Der Kommentarsatz von oben ist danach keine Behauptung mehr, sondern
-- eine vom Server durchgesetzte Invariante.
--
-- Das ist dieselbe Haltung, die schon der Kopf von 104 formuliert: „der Client
-- formt eine EINGABE, der CHECK sichert eine INVARIANTE."
--
-- Preis, benannt — und es sind DREI Wege, nicht einer (Schlusslesung
-- 05.08.2026, Befund 1; der erste Entwurf nannte nur den ersten). Ein Tab mit
-- dem 104-Bundle kennt die zwei neuen Spalten nicht, schreibt sie nicht und
-- vergleicht sie in seinem Compare-and-Swap nicht. Er faellt deshalb auf:
--
--   1. Er tippt eine Faelligkeit           -> `_faellig_stillgelegt`  (23514)
--   2. Er schaltet eine Zeile, der der NEUE Client ein Intervall oder eine
--      erste Zahlung gegeben hat, auf UNENTGELTLICH: er nullt Betrag und
--      Faelligkeit, laesst die zwei neuen Spalten aber stehen
--                                          -> `_ohne_entgelt`         (23514)
--   3. Er leert den BETRAG einer Zeile mit Intervall
--                                          -> `_intervall_braucht_betrag` (23514)
--
-- **Alle drei sind fail-loud, keiner verliert Daten**, und ein Neuladen behebt
-- sie. Der haeufigste Alt-Tab-Pfad — `valid_until` verlaengern — laeuft
-- unveraendert durch, weil er keine Entgelt-Spalte anfasst. Das ist der
-- richtige Tausch: drei verwirrende Meldungen in einem Zeitfenster von Minuten
-- sind besser als eine lautlos geloeschte Zahlungsabrede.
--
-- Ein `drop column` waere ab hier gleichwertig und sogar ehrlicher; er bleibt
-- allein wegen der Additiv-Regel aus.
--
-- DER RIEGEL AUS 104 WIRD ERSETZT, NICHT ERGAENZT
-- -----------------------------------------------
-- **Das ist der Fund, ohne den diese Migration ein Loch aufmachte.**
-- `hunting_licenses_ohne_entgelt` zaehlt seine Spalten NAMENTLICH auf
-- (`entgelt_betrag is null and entgelt_faellig is null`). Zwei neue Spalten
-- daneben waeren von ihm schlicht nicht erfasst: ein ausdruecklich
-- UNENTGELTLICHER Schein duerfte dann ein Zahlungsintervall und ein
-- Zahlungsdatum tragen — genau der Widerspruch, gegen den 104 den Riegel
-- gebaut hat.
--
-- Ein Constraint, der Spalten aufzaehlt, ist damit eine Stelle, die JEDE
-- spaetere Spalte derselben Familie mitpflegen muss. Das steht hier, weil es
-- beim naechsten Mal wieder auffallen muss.
--
-- Die Neufassung ist eine VERSCHAERFUNG und trifft 0 bestehende Zeilen (beide
-- neuen Spalten sind ueberall NULL). `is true` bleibt gegenueber `= true`
-- erhalten — ein Vergleich mit NULL ergibt NULL, und ein CHECK gilt als
-- erfuellt, wenn sein Ausdruck NULL ist.
--
-- WAS NICHT DAZUGEHOERT
-- ---------------------
-- Kein Zahlungsstatus, keine Erinnerung, keine Kontoanbindung. Das bleibt die
-- Grenze aus dem 104-Kopf: „wann gezahlt wird" ist eine Vereinbarung, „WURDE
-- gezahlt" waere ein anderes Produkt — Mahnung, Quittung, Jahresabschluss.
-- Diese Migration legt die Struktur, an die so etwas spaeter andocken
-- KOENNTE, und keine Zeile mehr.
--
-- DER RIEGEL IST DERSELBE WIE BEI 103 UND 104
-- -------------------------------------------
-- **KEINE Policy darf diese Spalten auswerten.** Ausser den zwei Spalten und
-- den zwei Constraints legt diese Datei nichts an: kein Trigger, keine
-- Funktion, kein Grant, kein Index, keine Policy-Aenderung. Die vier Policies
-- aus 079 tragen sie unveraendert — setzen und korrigieren darf sie der
-- Revierbesitzer (`hunting_licenses_issuer_update`, USING und WITH CHECK auf
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
-- Bestand bei Anlage: 4 Scheine, 0 mit `entgeltlich` gesetzt, 0 mit einem
-- Wert in `entgelt_betrag` oder `entgelt_faellig`.

alter table public.hunting_licenses
  add column if not exists entgelt_intervall text,
  add column if not exists entgelt_erste_zahlung date;

comment on column public.hunting_licenses.entgelt_intervall is
  'Wie oft das Entgelt gezahlt wird: jaehrlich, quartalsweise oder monatlich. '
  'NULL heisst "nicht vereinbart" — auch bei entgeltlich = true zulaessig. Die '
  'Voreinstellung "jaehrlich" steht im Formular, nicht als Spalten-Default: ein '
  'Default behauptete ueber Altbestand eine Vereinbarung, die niemand getroffen hat. '
  'Reine Auskunft, KEIN Berechtigungstraeger.';

comment on column public.hunting_licenses.entgelt_erste_zahlung is
  'Wann zum ersten Mal gezahlt wird. Zusammen mit entgelt_intervall ersetzt es den '
  'Freitext entgelt_faellig aus 104. Bewusst OHNE Plausibilitaetsgrenze: eine '
  'Anzahlung vor Beginn der Gueltigkeit ist ueblich, eine Abrechnung nach deren Ende '
  'ebenso. Ob gezahlt WURDE, haelt QuickHunt weiterhin nicht fest.';

-- Umgeschrieben, nicht geloescht: die Spalte bleibt (Projektregel „immer
-- additiv"), aber sie soll sich selbst erklaeren.
comment on column public.hunting_licenses.entgelt_faellig is
  'STILLGELEGT durch Migration 105 (05.08.2026): abgeloest von entgelt_intervall + '
  'entgelt_erste_zahlung und per CHECK hunting_licenses_entgelt_faellig_stillgelegt '
  'dauerhaft auf NULL festgenagelt. Die Spalte bleibt nur, weil Migrationen additiv '
  'sind. Trug in 104 den Zahlungsrhythmus als Freitext ("jaehrlich zum 1. April") — das '
  'liess sich keiner Kontobewegung zuordnen, ein Intervall plus Startdatum sehr wohl. '
  'Bestand beim Abloesen: 0 Werte.';

-- Die drei Werte, die das Formular anbietet. Als CHECK und nicht als Enum,
-- damit ein viertes Intervall eine Zeile kostet statt eines Typ-Eingriffs.
alter table public.hunting_licenses
  drop constraint if exists hunting_licenses_entgelt_intervall;
alter table public.hunting_licenses
  add constraint hunting_licenses_entgelt_intervall
  check (
    entgelt_intervall is null
    or entgelt_intervall in ('jaehrlich', 'quartalsweise', 'monatlich')
  );

-- **Der Riegel gegen den alten Client.** Ohne ihn koennte ein Tab mit dem
-- 104-Bundle waehrend und nach dem Deploy weiter eine Faelligkeit schreiben,
-- die der neue Client nicht liest, nicht vergleicht und beim naechsten
-- Speichern still mit NULL ueberschreibt (Codex P1 und P2, unabhaengig
-- voneinander, 05.08.2026). Hier prallt der Versuch mit `23514` ab: laut und
-- an der Quelle statt lautlos beim naechsten Speichern.
-- Trifft 0 bestehende Zeilen (0 Werte im Bestand, gemessen 05.08.2026).
alter table public.hunting_licenses
  drop constraint if exists hunting_licenses_entgelt_faellig_stillgelegt;
alter table public.hunting_licenses
  add constraint hunting_licenses_entgelt_faellig_stillgelegt
  check (entgelt_faellig is null);

-- **Ein Intervall ohne Betrag ist verboten**, weil keine Ansicht es zeigt: der
-- Client stellt „jaehrlich" nur neben einer Summe dar. Ohne diesen CHECK
-- koennte eine Zeile eine Vereinbarung tragen, die auf dem unterschriebenen
-- Blatt nie erscheint (Codex P1, 05.08.2026). Ein gespeicherter Wert, den
-- niemand sieht, ist schlimmer als ein verbotener Zustand.
-- Die Umkehrung gilt NICHT: ein Betrag ohne Intervall ist erlaubt, und ein
-- Termin ohne Betrag ebenfalls — eine Absprache muss nicht feststehen.
alter table public.hunting_licenses
  drop constraint if exists hunting_licenses_entgelt_intervall_braucht_betrag;
alter table public.hunting_licenses
  add constraint hunting_licenses_entgelt_intervall_braucht_betrag
  check (entgelt_intervall is null or entgelt_betrag is not null);

-- **Neufassung des Riegels aus 104 — er zaehlt seine Spalten namentlich auf.**
-- Ohne diese Zeilen duerfte ein ausdruecklich unentgeltlicher Schein ein
-- Zahlungsintervall und ein Zahlungsdatum tragen. Verschaerfung, 0 bestehende
-- Zeilen betroffen.
alter table public.hunting_licenses
  drop constraint if exists hunting_licenses_ohne_entgelt;
alter table public.hunting_licenses
  add constraint hunting_licenses_ohne_entgelt
  check (
    entgeltlich is true
    or (
      entgelt_betrag is null
      and entgelt_faellig is null
      and entgelt_intervall is null
      and entgelt_erste_zahlung is null
    )
  );
