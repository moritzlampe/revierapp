-- 093 — Die Revier-Suche an einer Position liefert nur, was auch erlaubt ist
--
-- **Nie ohne 092 lesen.** Diese Migration schliesst die Lücke, die 092 auf der
-- Client-Seite hinterlassen hat, und macht zugleich den Weg frei, auf dem die
-- native App die Erlegung des Revierbesitzers endlich zuordnet.
--
-- ===========================================================================
-- Der Anlass — die eigentliche Lücke von Schritt 1 (Moritz, 03.08.2026)
-- ===========================================================================
--
-- „Ich tipp auf eine Erlegung und bin im eigenen Revier (da hab ich keinen
-- Begehungsschein) → Auto-Zuordnung zum Revier wäre doch nur sinnvoll."
--
-- Er hat recht. Der Revierbesitzer allein in seinem Revier bekam bis hierher
-- **gar nichts**: seine Einzeljagd hat kein Revier (`createSoloHunt` setzt
-- `districtId: null`), einen Schein braucht er auf eigenem Grund nicht, und
-- damit greift weder Stufe 1 (Schein, 087) noch Stufe 2 (Jagd, 090/092).
-- `district_id` blieb null — im häufigsten Fall überhaupt.
--
-- Dass es am 03.08. im Test aussah, als funktioniere es, war ein Zufall der
-- Testdaten: Moritz hält auf sein eigenes Revier zusätzlich einen Schein.
--
-- **Der Entwurf sah zuerst eine dritte Ableitungsstufe im Kill-Trigger vor —
-- die entfällt, und das ist der wichtigste Teil dieses Kopfes.** Der Weg
-- existiert bereits vollständig, nur eben in der PWA
-- (`revierapp/src/components/erlegung/ErlegungSheet.tsx`):
--
--     GPS-Fix -> find_districts_for_point(lng, lat)
--       1 Revier   -> nehmen
--       2+ Reviere -> den Melder waehlen lassen
--       0 Reviere  -> ohne Revier
--     -> createSoloHunt({ districtId })  -> hunts.district_id
--     -> set_kill_herkunft() Stufe 2     -> kills.district_id
--
-- Eine dritte Stufe im Trigger waere ein ZWEITER Weg zu demselben Ziel
-- gewesen, mit einem neuen client-gesetzten Feld (`kills.district_id` als
-- Vorschlag), einer neuen Pruefung und einem neuen Fehlerpfad. Der bestehende
-- Weg ist geprueft: `hunt_revier_muss_erlaubt_sein()` aus 092 laesst eine Jagd
-- nur auf ein Revier zeigen, zu dem der Ersteller berechtigt ist. Was der
-- nativen App fehlt, ist allein der Aufruf.
--
-- ===========================================================================
-- Befund 1 (hoch) — die Suche bietet an, was 092 seit heute verweigert
-- ===========================================================================
--
-- `find_districts_for_point` filtert **nichts** ausser der Geometrie. Sie ist
-- SECURITY INVOKER, die Auswahl haengt also allein an den SELECT-Policies von
-- `districts` — und `districts_joined_participant_select` laesst **jedes**
-- Revier durch, in dem man auch nur einmal mitgejagt hat.
--
-- Seit 092 (appliziert 03.08.2026, wenige Stunden vor dieser Migration) wirft
-- die Jagd-Anlage auf so ein Revier `42501`. Damit bietet die PWA einen
-- Revier-Picker mit Eintraegen an, an denen der naechste Schritt scheitert —
-- genau der S2-Fall des Standard-Focus (UI-Gate gegen Policy).
--
-- **Nachgestellt am 03.08.2026, mit Rollback:** Heinrich
-- (`c61d2d8d-…`) steht mitten in Brockwinel. `find_districts_for_point`
-- liefert ihm „Brockwinel"; der darauf folgende
-- `insert into hunts (… district_id = 66eeed5f-…)` bricht mit
-- „42501: Zu diesem Revier darfst du keine Jagd anlegen" ab.
--
-- **Betroffen sind sieben Personen** (gemessen: ueber Brockwinel und Söder),
-- die eines dieser Reviere ausschliesslich ueber eine Teilnahme sehen.
--
-- Die PWA faengt den Fehlschlag ab — die Erlegung ist gerettet, sie bleibt nur
-- ohne Jagd —, aber **gepufferte Fotos gehen dabei verloren**
-- (`ErlegungSheet.tsx`, catch-Zweig: „Fotos wurden nicht gespeichert").
--
-- **Die neue Bedingung spiegelt `hunt_revier_muss_erlaubt_sein()` aus 092
-- zeichengleich** — Besitz ODER aktiver Schein, dessen Zeitraum den heutigen
-- BERLINER Kalendertag deckt. Weicht sie ab, entsteht der S2-Fall aufs Neue,
-- nur an einer anderen Stelle. Dieselbe Auflage wie zwischen 080 und 084.
--
-- **Der Zeitbezug ist bewusst `now()` und nicht der Erlegungszeitpunkt.** Die
-- Funktion beantwortet „wo darf ich jetzt eine Jagd anlegen", und genau das
-- prueft 092 auch. Der Kill-Trigger misst spaeter gegen `erlegt_am` — das ist
-- eine andere Frage an einer anderen Stelle und bleibt dort.
--
-- ===========================================================================
-- Befund 2 (mittel) — versteckte Reviere machten jede Zuordnung mehrdeutig
-- ===========================================================================
--
-- `hidden` blieb ungefiltert. Gemessen am 03.08.2026: steht Moritz mitten in
-- Brockwinel, liefert die Funktion ihm **sieben** Reviere — davon fuenf
-- versteckte Karteileichen („Brockwinkel" zweimal, „Test" dreimal). Der
-- Picker der PWA zeigt sie alle; in der nativen App waeren es sieben Chips,
-- von denen fuenf nichts bedeuten.
--
-- Schlimmer als die Anzeige ist die Folge fuer die Automatik: bei mehr als
-- einem Treffer darf nicht geraten werden, also braucht **jede** Zuordnung
-- eine Rueckfrage — auch dort, wo sachlich genau ein Revier in Frage kommt.
-- Nach dem Filter bleiben an derselben Stelle zwei (Brockwinel und das
-- ueberlappende „Test 5", 15 ha gemeinsame Flaeche), und das ist der echte
-- Fall, fuer den die Rueckfrage gedacht ist.
--
-- **`hidden = false` ist dieselbe Sicht, die `fetchMyDistricts` schon zieht**
-- (nativ `src/lib/data/districts.ts`) und die der Revierwechsler der Zentrale
-- nutzt. Der Kompromiss ist dort ausdruecklich beschrieben und gilt hier
-- genauso: versteckt der Besitzer ein Revier, verliert ein Scheininhaber es
-- still. Ein verstecktes Revier mit lebendem Schein ist ein Widerspruch, den
-- der Aussteller aufloesen soll — und die sichere Seite ist hier ohnehin
-- „keine Zuordnung" statt „falsche Zuordnung".
--
-- **Der Filter laeuft VOR der Mehrdeutigkeitsfrage, und das ist Absicht.**
-- Die Fremdpruefung hat das als Befund gemeldet (D5): liegt ein Punkt zugleich
-- in einem versteckten und einem sichtbaren berechtigten Revier, bleibt nur
-- das sichtbare uebrig, und der Client uebernimmt einen einzelnen Treffer ohne
-- Rueckfrage. Das ist genau die gewollte Wirkung. Ein verstecktes Revier ist
-- eines, das sein Besitzer nicht mehr fuehrt; es in eine Rueckfrage
-- aufzunehmen hiesse, den Melder zwischen einem gefuehrten und einem
-- aufgegebenen Revier waehlen zu lassen.
-- Gemessen am 03.08.2026 ist das kein Randfall, sondern der Normalfall:
-- **fuenf der neun Reviere sind versteckte Karteileichen, und alle fuenf
-- liegen ueber Brockwinel.** Ohne den Filter waere JEDE Zuordnung dort
-- mehrdeutig — die Rueckfrage wuerde zur Regel und damit wertlos.
--
-- **Bewusst NICHT mitgenommen, aber notiert:** 092 kennt `hidden` nicht und
-- laesst eine Jagd auf ein verstecktes eigenes Revier weiterhin zu. Die
-- beiden Stellen sind damit nicht deckungsgleich — kein Loch (der engere
-- Filter ist dieser hier, und er entscheidet, was ANGEBOTEN wird), aber eine
-- Unstimmigkeit. Sie hier aufzuloesen hiesse, die heute applizierte und mit 16
-- Gegenproben belegte Triggerfunktion aus 092 neu zu setzen; das ist der
-- schlechtere Tausch. Steht als C-23 im Backlog.
--
-- ===========================================================================
-- Was diese Migration bewusst NICHT tut
-- ===========================================================================
--
--   * **Kein `SECURITY DEFINER`.** Die Funktion bleibt INVOKER. Der Filter
--     kommt zur RLS hinzu, er ersetzt sie nicht; damit entsteht keine neue
--     Umgehungsflaeche. Der `exists`-Teilausdruck traegt, weil
--     `hunting_licenses_holder` (`holder_id = auth.uid()`) dem Inhaber seine
--     eigenen Scheine zeigt — gegengeprueft.
--   * **Kein Wechsel von `ST_Contains` auf `ST_Intersects`.** Ein Punkt genau
--     auf der Grenze faellt damit heraus. Das ist eine Aenderung ohne Nutzen:
--     ein GPS-Fix in `double precision` liegt nie exakt auf einer
--     Polygonkante, und die PWA verlaesst sich auf das bisherige Verhalten.
--   * **Keine Signaturaenderung.** Rueckgabe bleibt `setof districts`, damit
--     der bestehende PWA-Aufrufer und der generierte Typ in
--     `database.types.ts` unberuehrt bleiben. `create or replace` koennte den
--     Rueckgabetyp ohnehin nicht aendern.
--   * **Keine dritte Stufe in `set_kill_herkunft()`.** Begruendung oben.
--     `kills.district_id` bleibt ausschliesslich abgeleitet, nie
--     client-gesetzt — der Riegel aus 087/090/092 bleibt unangetastet.
--   * **Kein Aufraeumen der ueberlappenden Testreviere.** Brockwinel und
--     „Test 5" teilen sich 15 ha; das ist nach dem Filter der einzige
--     verbleibende Mehrdeutigkeitsfall und genau der, an dem sich die
--     Rueckfrage erproben laesst. Datenpflege ist Moritz' Entscheidung, nicht
--     die einer Migration.

-- ---------------------------------------------------------------------------
-- Die Revier-Suche, zweite Fassung
-- ---------------------------------------------------------------------------
--
-- `pg_temp` steht am Ende des search_path. Die Funktion ist INVOKER, das
-- Shadowing aus 076 traegt hier also nicht — ungenannt wuerde das Temp-Schema
-- aber ZUERST durchsucht, und die Projektregel gilt fuer jede neu geschriebene
-- Funktion. Kostet nichts.

create or replace function public.find_districts_for_point(
  p_lng double precision,
  p_lat double precision
)
returns setof public.districts
language sql
stable
set search_path = public, extensions, pg_temp
as $function$
  select d.*
    from public.districts d
   where extensions.st_contains(
           d.boundary,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
         )
     and not d.hidden
     -- Zeichengleich mit hunt_revier_muss_erlaubt_sein() aus 092. Weicht das
     -- eine vom anderen ab, bietet diese Funktion wieder Reviere an, an denen
     -- die Jagd-Anlage scheitert.
     and (
       d.owner_id = auth.uid()
       or exists (
         select 1
           from public.hunting_licenses l
          where l.district_id = d.id
            and l.holder_id = auth.uid()
            and l.status = 'aktiv'
            and (now() at time zone 'Europe/Berlin')::date
                between l.valid_from and l.valid_until
       )
     )
   order by d.name asc;
$function$;

-- ---------------------------------------------------------------------------
-- Gegenproben (als authenticated, jede mit ROLLBACK; Positivkontrolle zuerst)
-- ---------------------------------------------------------------------------
--
--   -- 1 Moritz mitten in Brockwinel                 -> 2 Zeilen (Brockwinel,
--   --                                                  Test 5), vorher 7
--   -- 2 die fuenf versteckten Reviere               -> in 1 nicht enthalten
--   -- 3 Heinrich mitten in Brockwinel (Befund 1)    -> 0 Zeilen, vorher 1
--   -- 4 Heinrich: Jagd auf Brockwinel anlegen       -> 42501 (unveraendert,
--   --                                                  aber jetzt nicht mehr
--   --                                                  angeboten)
--   -- 5 Positivkontrolle Schein: Inhaber mit gueltigem Schein, fremdes
--   --   Revier                                      -> 1 Zeile
--   -- 6 derselbe Inhaber, Schein auf abgelaufen     -> 0 Zeilen
--   -- 7 als anon                                    -> 0 Zeilen, KEIN Fehler
--   -- 8 Punkt ausserhalb jeder Grenze               -> 0 Zeilen
--   -- 9 jedes Revier aus 1 ist per createSoloHunt bebaubar (kein 42501)
