-- 077 — die Gültigkeit des Begehungsscheins wird zur Zugriffsgrenze
--
-- Nachtrag zu 068/069/071. Alle drei binden den Zugriff an `status = 'aktiv'`
-- und an sonst nichts. `hunting_licenses` führt aber zusätzlich `valid_from`
-- und `valid_until`, und die wurden bisher an genau EINER Stelle ausgewertet:
-- beim Einlösen des Codes. Gemessen am 31.07.2026 gegen die Produktions-DB:
--
--     Tor                                     status   Datum
--     schein_einloesen()                      ja       ja
--     districts_jes_select                    ja       NEIN
--     zones_jes_select                        ja       NEIN
--     get_my_jes_district_ids() -> Stände     ja       NEIN
--     kann_revier_pflegen()  (SCHREIBRECHT)   ja       NEIN
--
-- Die Asymmetrie ist der eigentliche Befund: einen abgelaufenen Code kann
-- niemand einlösen — wer ihn rechtzeitig eingelöst hat, behält den Zugriff
-- unbefristet. Revier, Grenze, Zonen und Stände blieben lesbar, und über
-- `kann_revier_pflegen()` blieben Kartenobjekte änderbar und löschbar. Ein
-- Begehungsschein, der zum 31.12. ausläuft, öffnete am 01.01. weiter alles.
--
-- Der naheliegende Weg wäre ein nächtlicher Job, der `status` auf
-- `'abgelaufen'` kippt. Bewusst NICHT genommen (Entscheidung Moritz,
-- 31.07.2026): er schließt das Tor bis zu 24 Stunden zu spät, und bleibt
-- pg_cron je stehen, schließt er es nie — ohne dass irgendetwas davon Meldung
-- macht. Ein Scheduler ist die falsche Bauform für eine Zugriffsgrenze; die
-- Grenze gehört dorthin, wo der Zugriff entschieden wird.
--
-- `current_date between valid_from and valid_until` deckt beide Enden ab, also
-- auch den noch nicht begonnenen Schein — der war bisher ab dem Anlegen offen.
-- Beide Grenzen sind einschließend, `valid_until` ist der letzte gültige Tag.
-- Genau so rechnet `schein_einloesen()` schon (`valid_until >= current_date`);
-- die beiden können daher nicht auseinanderlaufen.
--
-- ZEITZONE: die DB läuft auf UTC (`current_setting('TimeZone')` = 'UTC',
-- nachgemessen). Der Zugriff endet also um 00:00 UTC, im Berliner Sommer um
-- 02:00 Ortszeit. Wer im Client dasselbe Datum aus der GERÄTEZEIT rechnet,
-- weicht zwischen Mitternacht und 02:00 um einen Tag ab. Der native Client
-- nimmt deshalb UTC (`toISOString()`), nicht die lokale Zeit.
--
-- Der Bestand ist zum Zeitpunkt dieser Migration leer (`hunting_licenses`:
-- 0 Zeilen), es kann also keine Zeile geben, der hier etwas weggenommen wird.
--
-- Rückwärtskompatibel: die Bedingung wird enger, nicht anders. Ein gültiger
-- Schein verhält sich unverändert. Beide Clients teilen die DB, keiner von
-- beiden verlässt sich darauf, dass ein abgelaufener Schein noch öffnet.
--
-- NICHT angefasst: `hunting_licenses_holder`. Der Inhaber muss seinen eigenen
-- Schein weiter lesen können, gerade wenn er abgelaufen ist — `du/schein.tsx`
-- ist der einzige Ort, an dem steht, warum das Revier weg ist. Dieselbe
-- Überlegung wie bei 075.

-- ---------------------------------------------------------------------------
-- 1. Die Reviere, in denen mein Schein GERADE gilt
-- ---------------------------------------------------------------------------
-- Diese Funktion ist der Ort, an dem die Regel wohnen soll: `map_objects_jes_
-- select` fragt sie bereits, und `districts_jes_select` bekommt sie unten
-- ebenfalls. Damit steht die Bedingung nicht mehr in vier Kopien, sondern in
-- dreien — hier, in `kann_revier_pflegen()` und in `zones_jes_select`, das
-- wegen `zone_ids` nicht durch diese Funktion kann.
--
-- `pg_temp` bleibt am ENDE des search_path (Migration 076). `create or replace`
-- ersetzt die Funktionskonfiguration vollständig — wer die Zeile hier
-- weglässt, öffnet das Temp-Schema-Shadowing wieder, und nichts zeigt es an.
create or replace function public.get_my_jes_district_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select district_id
    from hunting_licenses
   where holder_id = auth.uid()
     and status = 'aktiv'::jes_status
     and current_date between valid_from and valid_until;
$$;

comment on function public.get_my_jes_district_ids() is
  'Reviere, für die der Aufrufer einen gültigen Begehungsschein hält — '
  'aktiv UND innerhalb von valid_from/valid_until. Migration 077.';

-- ---------------------------------------------------------------------------
-- 2. Das Schreibrecht endet mit der Gültigkeit
-- ---------------------------------------------------------------------------
-- Der schwerere Teil des Befunds: hieran hängen die Schreib-Policies auf
-- `map_objects` (071) und der Papierkorb (072/073/074). Ein abgelaufener
-- Schein durfte bis hierher Objekte anlegen, ändern und löschen.
--
-- Der Besitzer-Zweig bleibt ohne Datum — ein Revier gehört einem unbefristet.
create or replace function public.kann_revier_pflegen(p_district_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
           select 1 from districts
            where id = p_district_id and owner_id = auth.uid()
         )
      or exists (
           select 1 from hunting_licenses
            where district_id = p_district_id
              and holder_id = auth.uid()
              and status = 'aktiv'::jes_status
              and current_date between valid_from and valid_until
         );
$$;

comment on function public.kann_revier_pflegen(uuid) is
  'Darf der Aufrufer dieses Revier pflegen? Besitzer immer, Scheininhaber '
  'nur bei aktivem UND zeitlich gültigem Schein. Migration 077.';

-- ---------------------------------------------------------------------------
-- 3. Das Revier selbst
-- ---------------------------------------------------------------------------
-- Der Rumpf war zeichengleich mit `get_my_jes_district_ids()`. Statt die
-- Datumsbedingung ein viertes Mal zu schreiben, ruft die Policy jetzt die
-- Funktion — dieselbe Bauform, die `map_objects_jes_select` seit 069 nutzt.
-- Semantisch identisch, nur ohne die Kopie, die beim nächsten Mal jemand zu
-- ändern vergisst.
--
-- `to authenticated` ist NEU und nicht kosmetisch — ohne diese Zeile wäre der
-- Umbau eine Regression. Codex hat es angemerkt, nachgemessen am 31.07.2026:
--
--     als anon, VOR dieser Migration
--     select from districts     -> 0 Zeilen, kein Fehler
--     select from map_objects   -> ERROR 42501 permission denied
--     has_function_privilege('anon', 'get_my_jes_district_ids()') -> false
--
-- Policy-Ausdrücke laufen mit den Rechten des Aufrufers. Solange die Bedingung
-- als Inline-Subquery dasteht, liefert sie `anon` still 0 Zeilen. Sobald dort
-- eine Funktion steht, auf die `anon` kein EXECUTE hat, wird aus „0 Zeilen"
-- ein harter Fehler — und `districts` liest der Gast-/Akquise-Layer der PWA
-- unangemeldet. `to authenticated` lässt die Policy für `anon` gar nicht erst
-- greifen; der Aufruf findet nicht statt. Für Angemeldete ändert sich nichts.
--
-- Enger, nicht weiter: die Policy gab `anon` ohnehin nie eine Zeile, weil
-- `auth.uid()` dort NULL ist.
--
-- `drop ... if exists` macht den Lauf wiederholbar. PERMISSIVE und FOR SELECT
-- wie die abgelöste Fassung (nachgeprüft über pg_policy).
drop policy if exists districts_jes_select on public.districts;

create policy districts_jes_select on public.districts
  for select
  to authenticated
  using (id in (select public.get_my_jes_district_ids()));

-- ---------------------------------------------------------------------------
-- 4. Die zugeteilten Zonen
-- ---------------------------------------------------------------------------
-- Kann nicht über die Funktion laufen: die Zuteilung hängt zusätzlich an
-- `zone_ids` der EINZELNEN Schein-Zeile, nicht nur am Revier. Also die einzige
-- Stelle, an der die Bedingung noch einmal ausgeschrieben steht.
drop policy if exists zones_jes_select on public.zones;

create policy zones_jes_select on public.zones
  for select
  to authenticated
  using (
    exists (
      select 1
        from hunting_licenses hl
       where hl.holder_id = auth.uid()
         and hl.status = 'aktiv'::jes_status
         and current_date between hl.valid_from and hl.valid_until
         and hl.district_id = zones.district_id
         and zones.id = any (hl.zone_ids)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Der Bestandsfehler, den derselbe Handgriff behebt
-- ---------------------------------------------------------------------------
-- `map_objects_jes_select` ruft `get_my_jes_district_ids()` seit 069 und hat
-- kein `to authenticated`. Deshalb bricht `select from map_objects` für `anon`
-- schon heute mit 42501 ab, statt 0 Zeilen zu liefern — nachgemessen am
-- 31.07.2026, siehe oben. Das ist derselbe Fehler, den Punkt 3 für `districts`
-- gerade vermieden hat, nur schon ausgeliefert.
--
-- Der AUSDRUCK bleibt zeichengleich; einzig die Rollenangabe kommt dazu. Die
-- Datumsgrenze braucht diese Policy nicht selbst, sie erbt sie aus der
-- Funktion.
drop policy if exists map_objects_jes_select on public.map_objects;

create policy map_objects_jes_select on public.map_objects
  for select
  to authenticated
  using (
    district_id in (select public.get_my_jes_district_ids())
    and deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Anwenden (als Inhaber, in einer Transaktion mit Rollback)
-- ---------------------------------------------------------------------------
--   Schein gültig       -> districts 1, zones/Stände wie zugeteilt, pflegen true
--   valid_until gestern -> districts 0, Stände 0, pflegen false, Schein 1
--   valid_from morgen   -> districts 0, Stände 0, pflegen false, Schein 1
--   Besitzer            -> unverändert (Positivkontrolle, sonst sieht eine
--                          Migration, die ALLES zumacht, wie die richtige aus)
--   als anon            -> districts UND map_objects je 0 Zeilen, KEIN 42501
--
-- Und die pg_temp-Probe aus AGENTS.md muss weiterhin 0 Zeilen liefern.
