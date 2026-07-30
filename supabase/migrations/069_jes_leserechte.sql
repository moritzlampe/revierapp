-- 069 — Leserechte für Begehungsscheininhaber
--
-- Nachtrag zu 068. Der Schein schaltet dort `districts` frei, aber nichts
-- darin: gemessen am 30.07.2026 hat `zones` überhaupt keinen JES-Pfad und
-- `map_objects` nur einen über die Jagdteilnahme. Ein Pächter sah damit die
-- Reviergrenze und keinen einzigen Stand — und den Bereich, der eigens für ihn
-- eingezeichnet wurde, nie.
--
-- Das widerlegt einen Satz im Konzept (Begehungsschein §7, „das sieht er nach
-- dem Einlösen ohnehin"); der Satz war behauptet, nicht nachgemessen.
--
-- Additiv: nur neue SELECT-Policies, keine bestehende wird angefasst.

-- ---------------------------------------------------------------------------
-- 1. Meine Reviere per Begehungsschein
-- ---------------------------------------------------------------------------
-- Gleiche Bauform wie get_my_joined_hunt_ids(): SECURITY DEFINER, damit die
-- Policy nicht bei jeder Zeile erneut durch die RLS von hunting_licenses muss.
create or replace function public.get_my_jes_district_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select district_id
    from hunting_licenses
   where holder_id = auth.uid()
     and status = 'aktiv'::jes_status;
$$;

revoke execute on function public.get_my_jes_district_ids() from public, anon;
grant  execute on function public.get_my_jes_district_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Revierobjekte
-- ---------------------------------------------------------------------------
-- Er sieht ALLE Objekte des Reviers, nicht nur die Stände seines Scheins.
-- Grund: eine Karte, die nur die drei eigenen Stände zeigt, verschweigt, wo die
-- anderen sind — und genau das ist die Sicherheitsfrage aus Einzeljagd §1.
-- Die Beschränkung des Scheins ist eine Absprache, keine technische Sperre
-- (Begehungsschein §5, „V1 zeigt den Bereich, erzwingt ihn nicht").
drop policy if exists map_objects_jes_select on map_objects;
create policy map_objects_jes_select on map_objects
  for select
  using (district_id in (select get_my_jes_district_ids()));

-- ---------------------------------------------------------------------------
-- 3. Zonen
-- ---------------------------------------------------------------------------
-- Hier NICHT alle Zonen des Reviers, sondern nur die, die sein eigener Schein
-- benennt. Eine Zone ist eine Aussage über die Bewirtschaftung; welche Flächen
-- ein Revier sonst noch führt, geht einen einzelnen Pächter nichts an.
drop policy if exists zones_jes_select on zones;
create policy zones_jes_select on zones
  for select
  using (
    exists (
      select 1
        from hunting_licenses hl
       where hl.holder_id  = auth.uid()
         and hl.status     = 'aktiv'::jes_status
         and hl.district_id = zones.district_id
         and zones.id = any (hl.zone_ids)
    )
  );

-- ---------------------------------------------------------------------------
-- Bewusst NICHT hier drin
-- ---------------------------------------------------------------------------
-- valid_until wird auch von diesen Policies nicht geprüft — genauso wenig wie
-- von districts_jes_select. Das ist die bekannte Lücke aus Begehungsschein §8
-- (abgelaufener Schein mit status='aktiv' sieht weiter). Sie hier einseitig zu
-- schließen wäre schlechter als sie stehenzulassen: der Inhaber sähe dann die
-- Reviergrenze, aber keine Stände mehr, und niemand verstünde warum. Wenn sie
-- fällt, fällt sie an allen Stellen gleichzeitig.
--
-- Ruhezonen: ein Pächter sollte sehen, wo nicht gejagt wird. Moritz hat am
-- 30.07.2026 entschieden, dass das ein eigenes Konzept wird — Ruhezonen sind
-- Grenzen INNERHALB des Reviers und keine Sichtbarkeitsfrage.
--
-- SCHREIBEN. Diese Migration regelt nur das Lesen. Dass ein Scheininhaber sich
-- eigene Stände aufbaut, geht heute schon — nur geht es zu weit: gemessen am
-- 30.07.2026 hat `map_objects_creator_manage` als WITH CHECK allein
-- `created_by = auth.uid()`. Ein Nutzer ohne jede Beziehung zu einem Revier
-- konnte im Test ein `hochsitz`-Objekt hineinschreiben (rollback, keine Reste).
-- Der Riegel prüft, WER schreibt, aber nicht WOHIN. Das ist älter als dieses
-- Feature und bewusst nicht hier mitgeflickt — eigene Migration.

-- ---------------------------------------------------------------------------
-- Appliziert und gegengeprüft am 30.07.2026
-- ---------------------------------------------------------------------------
-- Testrevier „Karte (L7)" (dd77dd77-…), Testschein für Heinrich, zwei Zonen
-- davon eine im Schein — alles in einer Transaktion mit ROLLBACK.
--
--   mit aktivem Schein   Revier 1 · Objekte 33 · Zonen 1 (nur die eigene)
--   ohne Schein          Revier 0 · Objekte 0  · get_my_jes_district_ids() 0
--
-- Gegenprobe nach dem Rollback: hunting_licenses 0, zones 0, keine Testreste.
