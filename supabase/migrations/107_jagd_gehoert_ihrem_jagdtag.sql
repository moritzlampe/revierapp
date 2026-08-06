-- 107 — Eine geplante Jagd gehoert ihrem Jagdtag
--
-- ===========================================================================
-- Warum
-- ===========================================================================
--
-- Der Cron-Job `auto-end-stale-hunts` setzt `auto_completed`, sobald
-- `last_activity_at` 12 Stunden alt ist. `last_activity_at` heben genau drei
-- Trigger (`kills`, `messages`, `positions_current`) — nachts also keiner.
-- Eine Drueckjagd, die um 06:00 startet und deren letztes Lebenszeichen um
-- 06:30 faellt, wird um 18:30 eingesammelt: mitten am Jagdtag, kurz vor dem
-- Schuesseltreiben. Und sie kommt nicht zurueck, denn `startHunt` filtert
-- `status = 'scheduled'` (Backlog 0-neu-b, „Beenden ist ein Einweg-Schalter").
--
-- Migration 102 hat dagegen die Ausnahme gebaut: eine Jagd wird verschont,
-- solange `now() < scheduled_until`. Die Ausnahme greift aber nur, wenn die
-- Spalte einen Wert traegt — und wer plant, gibt selten ein Ende an.
--
-- Der native Client fuellt sie deshalb seit dem 04.08.2026 selbst
-- (`endeDesJagdtags` in `src/lib/hunt/draft.ts`). Moritz hatte danach gefragt:
-- „ist es schlauer diese in der voreinstellung bis zu dem jagdtag 24 uhr
-- laufen zu lassen? also immer fuer den einen tag?"
--
-- ===========================================================================
-- Warum ein Trigger und kein zweiter Client-Default
-- ===========================================================================
--
-- **Die PWA tat es an zwei eigenen Stellen nicht** — gemessen am 04.08.2026,
-- unveraendert am 06.08.2026: `app/app/hunt/create/page.tsx` (mobile PWA) und
-- `app/zentrale/jagden/liste.tsx` (Portal) schreiben `scheduled_for` und kein
-- Ende. **Dieselbe Jagd hatte damit je nach anlegendem Client ein anderes
-- Lebensende** — ueber die PWA geplante Jagden fielen weiter unter den nackten
-- 12-Stunden-Riegel, genau den Mechanismus, der im Bestand einmal 18 von 43
-- Jagden auf `auto_completed` gesetzt hat.
--
-- Der Kommentar in `draft.ts` benennt den Ausweg selbst: „Wer das schliessen
-- will, braucht einen Trigger auf `hunts`, keinen zweiten Client-Default."
-- Die Regel in beide PWA-Stellen zu kopieren waere die dritte und vierte
-- Fassung derselben Rechnung gewesen — vier Orte, an denen jemand sie aendern
-- kann, und drei, an denen er es vergisst. **Moritz hat am 06.08.2026 diesen
-- Weg gewaehlt.**
--
-- Der native Default bleibt vorerst stehen. Er rechnet dasselbe aus, ist unter
-- diesem Trigger also folgenlos; ihn zu entfernen ist ein eigener Schritt im
-- nativen Track, mit seinen eigenen Tests (`draft.test.ts` sichert die Werte
-- zu). Diese Migration erweitert die Regel, sie beseitigt keine.
--
-- ===========================================================================
-- Die Bedingung, und was sie bewusst nicht trifft
-- ===========================================================================
--
--   status IN ('draft','scheduled')  AND  scheduled_for IS NOT NULL
--                                    AND  scheduled_until IS NULL
--
--   * **`scheduled_for IS NOT NULL` ist der eigentliche Traeger.** Eine
--     spontane Jagd („Sofort starten") hat keinen geplanten Tag, nur ein
--     Jetzt — sie bekommt bewusst kein Ende, sonst waere „bis Mitternacht"
--     eine Angabe, die niemand gemacht hat. Zeichengleich zum nativen
--     `buildHuntInsert`, wo das Feld an `planned` haengt.
--   * **`draft` gehoert dazu, und der erste Entwurf hatte es vergessen.**
--     Zwei Pruefpakete haben es unabhaengig voneinander gefunden (06.08.2026).
--     Es sieht nach einem Randfall aus — 0 Zeilen im Bestand, kein Client
--     schreibt den Wert — ist aber genau der gefaehrliche: der Cron aus 102
--     filtert `status <> 'scheduled'`, **ein `draft` wird also sehr wohl
--     eingesammelt**, waehrend ein `scheduled` ohnehin unangetastet bleibt.
--     Ohne diesen Zweig waere die Voreinstellung ausgerechnet dort
--     ausgefallen, wo sie wirkt. Die Menge ist zeichengleich zu
--     `VORBEREITBARE_STATUS` des Portals (`app/zentrale/jagden/jagden.ts`) —
--     „geplant, noch nicht gelaufen".
--   * **Laufende und beendete Jagden bleiben heraus.** Im Bestand tragen
--     4 Zeilen ein `scheduled_for` und laufen oder sind vorbei; ohne diese
--     Einschraenkung bekaeme jede von ihnen bei der naechsten beliebigen
--     Aenderung (Chat auf/zu) ploetzlich ein Ende in der Vergangenheit
--     geschrieben. Folgenlos fuer den Cron, aber ein Schreiben, das niemand
--     angefordert hat.
--
-- **INSERT *und* UPDATE, und das ist der Unterschied zum Client-Default.**
-- Nur auf INSERT koennte ein Formular die Spalte hinterher wieder leeren und
-- genau den Zustand herstellen, gegen den der Trigger gebaut ist.
--
-- **Was er dabei NICHT leistet, obwohl hier zuerst das Gegenteil stand:** eine
-- geplante Jagd OHNE `scheduled_for` behaelt ihr leeres Ende — der Trigger
-- erzwingt nichts, wo er nichts zu rechnen hat. „Strukturell unerreichbar" war
-- also zu weit gegriffen (Fremdpruefung 06.08.2026). Folgenlos ist es
-- trotzdem: die Cron-Ausnahme verlangt BEIDE Spalten, und eine solche Zeile
-- traegt ohnehin einen Status, den der Cron gar nicht anfasst.
--
-- ===========================================================================
-- Berlin, und warum die Rueckwandlung am Ende steht
-- ===========================================================================
--
-- Der Jagdtag ist ein BERLINER Kalendertag — dieselbe Begruendung wie in 087
-- (`erlegt_am`), 092 und 095: die Datenbank laeuft auf UTC, und eine Jagd, die
-- um 23:00 Berliner Zeit beginnt, liegt in UTC schon am Folgetag.
--
--   date_trunc('day', scheduled_for at time zone 'Europe/Berlin')  -- lokal
--     + interval '1 day'                                           -- lokal
--     at time zone 'Europe/Berlin'                                 -- zurueck
--     - interval '1 microsecond'
--
-- **Die Addition steht in der lokalen Zeit, die Rueckwandlung danach** — nur
-- so nimmt die Rechnung die Sommerzeit mit. Ein Tag ist an der Zeitumstellung
-- 23 oder 25 Stunden lang; wer `+ interval '1 day'` auf den timestamptz
-- rechnete, traefe am Umstellungstag 23:00 oder 01:00 statt Mitternacht.
-- Gleiche Bauform wie das native `berlinMidnight(jahr, monat, tag + 1) - 1 ms`,
-- das aus demselben Grund nicht `setHours(23,59)` benutzt.
--
-- **Die MIKROsekunde, und der erste Entwurf hatte hier eine Millisekunde.**
-- `scheduled_until` soll so dicht wie moeglich an den letzten Moment des Tages
-- heran, ohne den Folgetag zu beruehren. **Der gespeicherte Zeitpunkt SELBST
-- ist dabei nicht mehr geschuetzt**, denn 102 vergleicht `now() <
-- scheduled_until` — er ist die erste ungeschuetzte Mikrosekunde, nicht die
-- letzte geschuetzte. Hier stand „letzter Moment, der noch dazu gehoert", und
-- das war einen Hauch staerker als der Vergleich haelt (Schlusslesung
-- 06.08.2026). Postgres loest
-- `timestamptz` aber auf Mikrosekunden auf: mit `- 1 millisecond` lagen
-- zwischen `23:59:59.999000` und Mitternacht noch 999 unbeschuetzte
-- Mikrosekunden, und der Kommentar „letzter Moment" war damit schlicht falsch
-- (Fremdpruefung 06.08.2026). Jetzt ist er wahr.
--
-- **Nicht stattdessen die naechste Mitternacht speichern**, obwohl das mit `<`
-- ebenso dicht waere: der Wert wird auch GELESEN, und `mehrtaegig()` vergleicht
-- Berliner Kalenderdaten (Migration 095). Mitternacht des Folgetags machte aus
-- jeder eintaegigen Jagd eine mehrtaegige.
--
-- **Der native Client rechnet weiter mit Millisekunden** (`endeDesJagdtags` in
-- `quickhunt-native/src/lib/hunt/draft.ts`) — JavaScript kennt nichts
-- Feineres. Die beiden Werte liegen also 999 Mikrosekunden auseinander; beide
-- liegen im selben Berliner Kalendertag, und keine Auswertung dieses Projekts
-- unterscheidet sie. „Zeichengleich" waere trotzdem zu viel gesagt.
--
-- ===========================================================================
-- Was diese Migration bewusst NICHT tut
-- ===========================================================================
--
--   * **KEIN Riegel `scheduled_until >= scheduled_for`.** 095 hat ihn
--     ausdruecklich abgelehnt und begruendet: „Die Reihenfolge gehoert dorthin,
--     wo sie dem Nutzer erklaert werden kann: ins Formular." Der Trigger setzt
--     eine VOREINSTELLUNG, er erzwingt keine Invariante — das sind zwei
--     verschiedene Dinge, und nur das erste war gefragt.
--     **Folge, benannt statt geheilt:** wer den Starttermin einer Jagd mit
--     bereits gesetztem Ende nach hinten schiebt, behaelt ein Ende vor dem
--     Start. Das faengt das Formular ab — nativ seit dem 04.08. mit zwei
--     getrennten Zweigen (nur nach oben zu spiegeln war dort der erste,
--     falsche Anlauf), im Portal mit derselben Regel.
--   * **KEINE Obergrenze fuer die Dauer.** Die sitzt im Cron (102, zwei
--     Deckel) und im Formular (`MAX_JAGD_TAGE`). Eine dritte Stelle waere
--     genau die Vervielfachung, gegen die dieser Trigger gebaut ist.
--   * **KEIN Backfill.** 24 Jagden, davon 4 mit `scheduled_for`, **0 mit
--     `scheduled_until`, 0 auf `scheduled`** (gemessen 06.08.2026). Keine von
--     ihnen war je als mehrtaegig erfasst — dieselbe Begruendung wie in 095.
--     Der Trigger wirkt damit ab der naechsten geplanten Jagd und aendert
--     beim Applizieren keine einzige Zeile.
--   * **KEINE Policy-Aenderung.** `hunts_creator_all` und `hunts_leader_update`
--     sind spaltenunabhaengig. Wer die Jagd schreiben darf, schreibt die
--     Spalte; wer nicht, kommt gar nicht erst hierher.
--
-- ===========================================================================
-- Reihenfolge der BEFORE-Trigger — nachgesehen, nicht angenommen
-- ===========================================================================
--
-- BEFORE-ROW-Trigger feuern alphabetisch. In 096 war genau das ein
-- Korrektheitsargument: auf `kills` haette ein falsch benannter Trigger den
-- Trichinen-Setzer ein leeres `wild_art` lesen lassen.
--
-- Auf `hunts` ist es gegenstandslos, und das ist gemessen (06.08.2026):
--
--   hunts_creator_id_fest     BEFORE UPDATE            -> creator_id
--   trg_hunts_endtermin       BEFORE INSERT OR UPDATE  -> scheduled_until  (neu)
--   trg_hunts_revier_erlaubt  BEFORE INSERT OR UPDATE  -> district_id, wirft
--   trg_hunts_updated         BEFORE UPDATE            -> updated_at
--
-- Keiner der drei bestehenden liest oder schreibt `scheduled_for` oder
-- `scheduled_until`. Der Name sortiert trotzdem vor `trg_hunts_revier_erlaubt`,
-- damit die Zuordnung Name -> Reihenfolge nachvollziehbar bleibt, falls dort
-- spaeter doch etwas dazukommt.
--
-- ===========================================================================
-- Wie oft er feuert — und warum der Rumpf tabellenfrei BLEIBEN muss
-- ===========================================================================
--
-- `BEFORE INSERT OR UPDATE` heisst: bei JEDEM Schreiben auf `hunts`. Das ist
-- mehr, als es klingt — `trg_positions_current_activity` hebt
-- `last_activity_at`, dieser Trigger laeuft also auch am Jagdtag mit und nicht
-- nur beim Planen (Schlusslesung 06.08.2026).
--
-- **Hier stand „bei jedem GPS-Ping jeder laufenden Jagd", und das war zu viel**
-- (Delta-Durchgang 06.08.2026, nachgemessen): `update_hunt_last_activity()` ist
-- gedrosselt. Migration 039 filtert `last_activity_at < now() - interval
-- '1 minute'`, ihr Kopf sagt es ausdruecklich („saves ~90% of writes from
-- high-frequency GPS pings"). Trifft das WHERE null Zeilen, feuert gar kein
-- Row-Trigger. Real also **hoechstens einmal pro Minute je aktiver Jagd**.
-- Die Folgerung darunter aendert das nicht — sie wird nur ehrlicher begruendet.
--
-- Heute ist das folgenlos: der Rumpf liest keine einzige Tabelle, greift auf
-- keinen Index und bricht bei einer laufenden Jagd am ersten Vergleich ab —
-- ein Statusvergleich auf NEW, mehr nicht. **Genau deshalb darf er tabellenfrei
-- bleiben.** Wer hier spaeter ein SELECT einbaut (etwa gegen `districts` oder
-- `hunting_licenses`, wie es die Trigger aus 087/092 tun), legt es in den
-- Positionsstrom jeder aktiven Jagd. Der Platz dafuer ist ein eigener Trigger
-- mit `WHEN`-Klausel, nicht dieser.

create or replace function public.hunt_endtermin_voreinstellung()
returns trigger
language plpgsql
-- SECURITY INVOKER (Default, hier ausgeschrieben): die Funktion liest keine
-- einzige Tabelle, sondern nur NEW. Ein DEFINER waere Rechte ohne Anlass.
security invoker
-- Kein Tabellenzugriff, also nichts zu beschatten — der search_path steht
-- trotzdem, weil er im Rumpf nichts kostet und die Hausregel aus AGENTS.md
-- keine Ausnahme kennt, an der man sich spaeter orientieren muesste.
set search_path = public, pg_temp
as $$
begin
  if new.status in ('draft', 'scheduled')
     and new.scheduled_for is not null
     and new.scheduled_until is null
  then
    new.scheduled_until :=
      ((date_trunc('day', new.scheduled_for at time zone 'Europe/Berlin')
        + interval '1 day') at time zone 'Europe/Berlin')
      - interval '1 microsecond';
  end if;
  return new;
end;
$$;

comment on function public.hunt_endtermin_voreinstellung() is
  'Voreinstellung fuer hunts.scheduled_until: eine geplante Jagd (draft oder '
  'scheduled) MIT scheduled_for, aber ohne gewaehltes Ende gehoert ihrem '
  'Berliner Jagdtag — letzter Moment, 23:59:59.999999 Ortszeit. Verhindert, '
  'dass auto-end-stale-hunts (Migration 102) sie einsammelt, sobald 12 h ohne '
  'Lebenszeichen vergangen sind. Setzt eine VOREINSTELLUNG, keine Invariante: '
  'die Reihenfolge until >= for gehoert laut 095 ins Formular, und eine Zeile '
  'ohne scheduled_for behaelt ihr leeres Ende.';

-- Trigger-Funktionen gehoeren niemandem (Migration 082). `FROM PUBLIC` allein
-- entzieht bei Supabase GAR NICHTS: die drei Rollen haben ein eigenes,
-- explizites GRANT aus `ALTER DEFAULT PRIVILEGES` und muessen namentlich
-- genannt werden. Postgres prueft EXECUTE beim ANLEGEN des Triggers, nicht
-- beim Feuern — der Entzug bricht den Betrieb also nicht.
revoke execute on function public.hunt_endtermin_voreinstellung()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_hunts_endtermin on public.hunts;
create trigger trg_hunts_endtermin
  before insert or update on public.hunts
  for each row
  execute function public.hunt_endtermin_voreinstellung();

-- ---------------------------------------------------------------------------
-- Gegenproben (NACH dem Applizieren; die schreibenden mit ROLLBACK)
-- ---------------------------------------------------------------------------
--
--   -- 1 Positivkontrolle: geplante Jagd OHNE Ende -> Ende = Berliner
--        Tagesende von scheduled_for, 23:59:59.999999 Ortszeit. Fuer
--        `scheduled` UND fuer `draft` getrennt fahren.
--   -- 1b Eine geplante Jagd OHNE scheduled_for -> Ende bleibt NULL. Das ist
--        die Zeile, die die Grenze des Triggers festhaelt, statt sie zu
--        behaupten.
--   -- 2 Geplante Jagd MIT gewaehltem Ende -> Wert bleibt unveraendert
--        (der Trigger ueberschreibt nichts).
--   -- 3 Spontane Jagd (scheduled_for NULL, status 'active') -> Ende bleibt NULL.
--   -- 4 UPDATE: an einer geplanten Jagd das Ende auf NULL setzen
--        -> wird sofort wieder auf das Tagesende gesetzt. Das ist die Zeile,
--           die den Unterschied zum Client-Default belegt.
--   -- 5 Sommerzeit: scheduled_for am 2026-03-29 (Umstellungstag, 23 h)
--        und am 2026-10-25 (25 h) -> beide Male exakt der letzte Moment des
--        BERLINER Tages, nicht 23:00 und nicht 01:00 des Folgetags.
--        Mutantenprobe dazu: `+ interval '1 day'` auf den timestamptz
--        gerechnet muss an genau diesen zwei Tagen abweichen — sonst belegt
--        die Probe nur, dass die Abschrift zu sich selbst passt.
--        **VORAB GEFAHREN am 06.08.2026, lesend und ohne die Funktion** (der
--        Ausdruck allein braucht sie nicht): 7 Faelle, alle im selben Berliner
--        Kalendertag, alle nach dem Start; der Mutant wich an genau den zwei
--        Umstellungstagen ab (30.03. 00:59:59.999 statt 29.03. 23:59:59.999,
--        und 25.10. 22:59:59.999 statt 23:59:59.999). Nach dem Applizieren
--        gegen die FUNKTION wiederholen, nicht nur gegen den Ausdruck.
--   -- 5b Die Endkante auf die Mikrosekunde: `scheduled_until` muss
--        `23:59:59.999999` Ortszeit sein, nicht `.999000`. Gegenprobe gegen
--        102: bei `now() = scheduled_until` greift `now() < scheduled_until`
--        nicht mehr — der ungeschuetzte Rest darf hoechstens 1 µs sein.
--   -- 6 Gegen den nativen Client: derselbe scheduled_for durch
--        `endeDesJagdtags()` und durch den Trigger -> derselbe Berliner
--        Kalendertag, Abstand genau 999 µs (JS kann nicht feiner).
--   -- 7 Regression 092: `trg_hunts_revier_erlaubt` wirft weiterhin `42501`
--        fuer ein fremdes Revier — der neue Trigger haengt sich davor und
--        darf daran nichts aendern.
--   -- 8 Regression: startHunt (`status='scheduled'` -> 'active') und endHunt
--        laufen unveraendert; scheduled_until bleibt dabei stehen.
--   -- 9 EXECUTE entzogen:
--        select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
--               has_function_privilege('service_role', p.oid, 'EXECUTE') as svc
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public'
--           and p.proname = 'hunt_endtermin_voreinstellung';
--        -- erwartet: dreimal false, und der Trigger feuert trotzdem (082).
--   -- 10 Bestand: 24 Jagden vorher wie nachher, `scheduled_until` weiterhin
--        bei 0 Zeilen gesetzt (die Migration schreibt nichts).
--   -- 11 `anon` liest `hunts` als Zahl statt als Fehler.
