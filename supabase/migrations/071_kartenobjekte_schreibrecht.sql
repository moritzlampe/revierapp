-- 071 — Schreibrecht auf Kartenobjekte eingrenzen
--
-- Gemessen am 30.07.2026: `map_objects_creator_manage` hatte als einzige
-- Bedingung `created_by = auth.uid()` — in USING wie in WITH CHECK. Der Riegel
-- prüfte, WER schreibt, aber nicht WOHIN. Ein Nutzer ohne jede Beziehung zu
-- einem Revier konnte dort einen Hochsitz eintragen; im Test gelungen
-- (rollback, keine Reste).
--
-- Gefahrlos, weil nachgemessen: von 238 Kartenobjekten mit Revier stammen
-- 238 vom jeweiligen Revierbesitzer. Niemand verliert ein Recht, das er heute
-- ausübt.

-- ---------------------------------------------------------------------------
-- 1. Wer darf ein Revier pflegen
-- ---------------------------------------------------------------------------
-- Dieselbe Bauform wie is_revierinhaber() aus 068: die Frage wird an EINER
-- Stelle beantwortet. Heute sind es Besitzer und aktive Scheininhaber.
--
-- Ausdrücklich als Erweiterungspunkt gedacht. Moritz' Fall vom 30.07.2026 —
-- ein Helfer, der Hochsitze aufbaut, aber nicht jagen darf — passt in keine
-- der beiden Gruppen und braucht eine Revier-Rolle. Die gibt es noch nicht
-- (`participant_role` ist jagdleiter|schuetze|treiber und gilt pro JAGD).
-- Kommt sie, ändert sich diese Funktion und keine Policy.
create or replace function public.kann_revier_pflegen(p_district_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
         );
$$;

revoke execute on function public.kann_revier_pflegen(uuid) from public, anon;
grant  execute on function public.kann_revier_pflegen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Policy
-- ---------------------------------------------------------------------------
-- `district_id is null` bleibt frei: das sind die Ad-hoc-Objekte, die jemand
-- unterwegs setzt, ohne dass sie zu einem Revier gehören. Für sie ist
-- `created_by` die richtige und einzige Grenze — es gibt kein Revier, in das
-- man sich hineinschreiben könnte.
drop policy if exists map_objects_creator_manage on map_objects;
create policy map_objects_creator_manage on map_objects
  for all
  using      (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id)))
  with check (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id)));

-- map_objects_district_owner bleibt unangetastet: der Revierbesitzer darf
-- weiterhin auch fremde Objekte in seinem Revier bearbeiten, nicht nur eigene.

-- ---------------------------------------------------------------------------
-- Gegenproben (nach dem Apply)
-- ---------------------------------------------------------------------------
-- a) Fremder schreibt NICHT mehr ins fremde Revier:
--      begin; set local role authenticated;
--        set local "request.jwt.claim.sub" = '<uuid ohne Bezug>';
--        insert into map_objects (district_id, type, name, position, created_by)
--        values ('<testrevier>','hochsitz','071-Probe',
--                extensions.st_geomfromtext('POINT(10 53)',4326),'<dieselbe uuid>');
--      rollback;   -- muss mit 42501 scheitern
--
-- b) Positivkontrolle, sonst beweist (a) nichts: derselbe INSERT mit der
--    UUID des Revierbesitzers muss durchgehen.
--
-- c) Ad-hoc-Objekt ohne Revier geht weiterhin (district_id null).
