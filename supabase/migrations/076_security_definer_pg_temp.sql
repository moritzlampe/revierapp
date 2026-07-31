-- 076 — pg_temp aus dem Weg räumen (alle SECURITY-DEFINER-Funktionen)
--
-- ============================================================================
-- STATUS: APPLIZIERT UND GEGENGEPRÜFT 31.07.2026 (Freigabe Moritz).
--
--   Vollständigkeit:  36 SECURITY-DEFINER-Funktionen, 0 ohne pg_temp
--   Angriff danach:   0 Objekte / kann_revier_pflegen false / Name null
--   Positivkontrolle: Moritz 9 Reviere, 3 Objekte, 38 Jagden, pflegen true
--                     Heinrich sieht Brockwinel und die Pilotjagd weiter
--
-- Die Positivkontrolle gehört dazu: eine Änderung, die ALLES zumacht, sieht im
-- Negativtest genauso aus wie die richtige.
-- ============================================================================
--
-- ## Der Befund
--
-- Wird bei einer SECURITY-DEFINER-Funktion `search_path = public` gesetzt und
-- `pg_temp` NICHT genannt, durchsucht Postgres das Temp-Schema trotzdem — und
-- zwar ZUERST. Ein Angemeldeter darf temporäre Tabellen anlegen
-- (`has_database_privilege('authenticated', …, 'TEMP')` = true, gemessen), also
-- kann er eine Tabelle unterschieben, die genauso heißt wie die echte. Die
-- Funktion läuft mit den Rechten ihres Eigentümers und liest seine Fassung.
--
-- Nachgestellt am 31.07.2026 gegen die Produktions-DB, als Nutzer OHNE jeden
-- Begehungsschein, alles in einer Transaktion mit Rollback:
--
--     create temp table hunting_licenses (district_id uuid, holder_id uuid,
--                                         status jes_status);
--     insert into pg_temp.hunting_licenses values (<Brockwinel>, <ich>, 'aktiv');
--
--                                     vorher    danach
--     map_objects in Brockwinel          0        3     <- echte Pilotdaten
--     kann_revier_pflegen(Brockwinel)  false     true
--     schein_revier_name(Brockwinel)    null   'Brockwinel'
--
-- **`districts` blieb zu, und das ist der aufschlussreiche Teil.**
-- `districts_jes_select` trägt seine Bedingung als Unterabfrage IM POLICY-RUMPF,
-- und den speichert Postgres als aufgelösten Baum mit festen OIDs — immun.
-- Funktionsrümpfe (`language sql`, `language plpgsql`) werden bei jedem Aufruf
-- neu aufgelöst. Genau deshalb trifft es die Funktionen und nicht die Policies —
-- nur stecken die Funktionen in den Policies, und damit trifft es doch alles.
--
-- Betroffen war fast der ganze Bestand: von 36 SECURITY-DEFINER-Funktionen
-- hatten nur 7 `pg_temp` am Ende (die Papierkorb-Funktionen aus 072/073 und
-- ein paar Trigger), eine hatte gar keinen search_path.
--
-- ## Die Behebung
--
-- `pg_temp` explizit ans ENDE. Wird es genannt, gilt die genannte Position, und
-- die echte Tabelle in `public` gewinnt. Kein Funktionsrumpf muss angefasst
-- werden — nur die SET-Klausel, per ALTER.
--
-- Bewusst NICHT `search_path = ''` mit durchgängiger Schemaqualifizierung: das
-- wäre die strengere Fassung, verlangt aber, jeden Rumpf umzuschreiben. Bei 28
-- Funktionen aus zwei Strängen ist das viel Angriffsfläche für einen Tippfehler,
-- und die Wirkung ist dieselbe. Wer später einzelne Funktionen härtet, kann es
-- dort nachziehen.
--
-- Idempotent: bereits gesetzte Funktionen werden übersprungen. Erneut ausführbar.

do $$
declare
  f   record;
  neu text;
begin
  for f in
    select p.oid::regprocedure::text as sig,
           (select c
              from unnest(coalesce(p.proconfig, '{}')) as c
             where c like 'search_path=%') as cfg
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    if f.cfg is null then
      -- Gar kein search_path gesetzt: der gefährlichste Fall, denn dann gilt
      -- der des Aufrufers.
      neu := 'public, pg_temp';
    elsif f.cfg like '%pg_temp%' then
      continue;
    else
      -- 'search_path=' sind 12 Zeichen; der Rest ist der bestehende Wert und
      -- bleibt unverändert (insbesondere `extensions`, wo PostGIS gebraucht wird).
      neu := substring(f.cfg from 13) || ', pg_temp';
    end if;

    execute format('alter function %s set search_path = %s', f.sig, neu);
  end loop;
end $$;

-- Gegenprobe nach dem Anwenden — der Angriff von oben muss ins Leere laufen:
--
--   begin;
--   set local role authenticated;
--   set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000000';
--   create temp table hunting_licenses (district_id uuid, holder_id uuid,
--                                       status jes_status);
--   insert into pg_temp.hunting_licenses
--        values ('66eeed5f-6f18-4d9c-adf4-00d6bc2ae5a0',
--                '00000000-0000-4000-8000-000000000000','aktiv');
--   select (select count(*) from map_objects
--            where district_id='66eeed5f-6f18-4d9c-adf4-00d6bc2ae5a0')   -- 0
--        , kann_revier_pflegen('66eeed5f-6f18-4d9c-adf4-00d6bc2ae5a0')   -- false
--        , schein_revier_name('66eeed5f-6f18-4d9c-adf4-00d6bc2ae5a0');   -- null
--   rollback;
--
-- Im Trockenlauf am 31.07.2026 genau so gemessen: 0, false, null.
--
-- Und die Vollständigkeitsprobe — muss 0 Zeilen liefern:
--
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.prosecdef
--      and coalesce(array_to_string(p.proconfig,','),'') not like '%pg_temp%';
