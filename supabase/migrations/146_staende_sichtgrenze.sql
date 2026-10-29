-- 146: Sichtgrenze fuer Staende — Schuetzen sehen ihren Stand erst nach der
-- Freigabe durch den Jagdleiter, spaetestens eine Stunde vor Jagdbeginn (CP-116).
--
-- ANLASS: Moritz am 28.10.2026: "ich plane heute eine Jagd fuer den 01.12. und
-- lade leute schonmal ein. die staende verteile ich aber erst in zwei wochen.
-- in drei wochen sagen drei leute ab und ich stelle um: der eingeladene schuetze
-- sieht seinen stand, kennt ihn und sagt super der ist klasse. ne woche spaeter
-- sieht er er wurde umgesetzt -> das bringt doch unnoetig unruhe?"
-- Bauplan (F14 geprueft, GELOCKT V1.4, Freigabe Moritz 29.10.2026):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Sichtgrenze_Staende_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/146_staende_sichtgrenze.md
--
--
-- DIE REGEL (Bauplan §0, E2)
--
-- Ein Schuetze sieht Staende, sobald EINES gilt:
--   1. der Jagdleiter hat freigegeben            (`hunts.map_open`, E1)
--   2. die Jagd laeuft                            (`status` active/paused)
--   3. die Jagd ist gestartet worden              (`started_at` gesetzt)
--   4. ein Treiben der Jagd ist gestartet worden  (`hunt_drives.started_at`)
--   5. es ist eine Stunde vor dem geplanten Beginn (`scheduled_for - 1 h`)
-- Die Leitung (`sicht_stufe` = 'leitung': Ersteller, Revierbesitzer, Rolle
-- jagdleiter) sieht immer alles.
--
-- "Staende" heisst: der eigene jagdweite Stand, die eigenen Treiben-Staende
-- UND die Sitzordnung der anderen (bei `alles` heute sofort lesbar, P2).
--
-- 3. geht ueber Moritz' Wortlaut hinaus: ohne ihn verloere eine sofort
-- gestartete und beendete Jagd (kein Termin, nicht freigegeben, nicht mehr
-- aktiv) ihre Staende wieder — im Rueckblick und im Tagebuch, die 141 der Stufe
-- folgen laesst. Alle Startwege setzen `started_at` (Bauplan §1.2).
-- 4. deckt ein Treiben auf einer noch geplanten Jagd ab: der Treiben-Knopf hat
-- keine Statusbedingung (Bauplan §1.2, Schlusslesung F1).
-- 5. ist eine ABSOLUTE Stunde auf timestamptz — kein Kalendertag wie in
-- `jagd_ist_offen`, also kein 23-/25-Stunden-Tag.
--
--
-- WAS SICH AENDERT (drei Einbaustellen, eine Policy, Bauplan E2)
--
-- a) NEU `staende_offen(hunt_id)` — reiner Jagdzustand, ohne auth.uid().
--    INVOKER, STABLE, EXECUTE fuer niemanden (wie `jagd_ist_offen`): gerufen
--    wird sie nur aus DEFINER-Funktionen und laeuft dort mit deren Rechten.
-- b) `staende_der_teilnahme`: im CTE `t` zusaetzlich `staende_offen`. Damit
--    sind die eigenen Stand-Objekte (P4) und die Umkreis-Mitte (P5) zu; bei
--    `umkreis` gibt es vor der Freigabe auch keine Objekte im Umkreis.
-- c) `stand_zeile_in_sicht`: `leitung or (staende_offen and <bisher>)`.
--    Damit sind Sitzordnung (P2), Treiben-Staende (P3), der Stand-Bezug
--    ANDERER (P6) und die Ja/Nein-RPCs (P7) zu — einschliesslich der
--    Eigen-Zweige. Die EIGENE Bezugszeile bleibt ueber `stand_bezug_own` (ALL)
--    lesbar: sie traegt keine Zuteilung, die der Schuetze nicht selbst gesetzt
--    hat, und entsteht nur bei laufender Jagd (Bauplan §1.1; Codex 146 Punkt 1).
-- d) `sitz_in_sicht`: Eigen-Zweig zusaetzlich `staende_offen` — ausser fuer die
--    Leitung. Ein Jagdleiter mit `left` und `joined_at` (sicht_stufe 'leitung')
--    erreicht seinen Sitz nur ueber den Eigen-Zweig, denn der Fremd-Zweig
--    verlangt `joined` (Codex 146 Punkt 5).
-- e) `seat_assignments_participant_select`: USING nur noch `sitz_in_sicht(id)`.
--    Der Inline-Eigen-Zweig muss weg: er duerfte `staende_offen` ohne EXECUTE
--    nicht rufen (Schlusslesung V1, Punkt 21), und `sitz_in_sicht` traegt den
--    Eigen- und den Fremd-Zweig schon. Bei offener Grenze gleichwertig:
--    alt = (eigen ∧ Teilnahme) ∨ (joined ∧ sitz_in_sicht)
--        = (eigen ∧ Teilnahme) ∨ (joined ∧ stand_zeile_in_sicht),
--    neu = sitz_in_sicht = dasselbe, wenn `staende_offen` wahr ist.
-- `objekt_in_sicht`, `treiben_stand_in_sicht`, `bezug_in_sicht` und
-- `ort_in_umkreis` erben die Grenze ueber b) und c) und bleiben unveraendert.
--
--
-- AKTIVE FALLEN
--
-- - Die Lesefunktionen MUESSEN SECURITY DEFINER bleiben (130 Falle 4, 141).
--   `create or replace` behaelt Eigentuemer, Kommentar und EXECUTE-Rechte,
--   NICHT aber DEFINER und `search_path` — beides steht deshalb ausdruecklich in
--   jedem Rumpf unten (Codex 146 Punkt 6).
-- - `staende_offen` liest `hunts` und `hunt_drives` mit den Rechten des
--   aufrufenden DEFINER-Rumpfs. Wer sie aus einer INVOKER-Stelle ruft, bekommt
--   42501 (kein EXECUTE) — gewollt, sie ist intern.
-- - Monoton ist Zweig 4 nur in den Clients: die Policies erlauben der Leitung,
--   ein gestartetes Treiben zu loeschen (Bauplan E2, CN-436 b). Hingenommen.
-- - Ein Termin, der nach T-1h nach hinten verschoben wird, schliesst die
--   Staende wieder, solange nicht freigegeben ist (Bauplan E3, Moritz D3,
--   CN-436 a). Nur das Portal aendert den Termin.
-- - Der Matrix-Hinweis im Portal ("zugesagte Schuetzen sehen sofort",
--   `verteilen-bereich.tsx`) wird mit dem Applizieren falsch. Der Portal-Strang
--   stellt ihn im selben Zug um — VOR dem Applizieren benachrichtigen
--   (Bauplan E8).
-- - Bestand beim Schreiben (29.10.2026): 7 Sitzzeilen und 15 Treiben-Staende,
--   alle an der Testjagd "P2b Klicktest" (geplant 01.12., nicht freigegeben,
--   einziger Zugesagter ist ihr Ersteller). Das Applizieren nimmt niemandem
--   etwas Sichtbares.
--
-- Apply-Weg: `psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" -f`
-- (wie 142, 143: `drop policy` stellt sonst jeden neuen Leser hinter sich an;
-- Schlusslesung 146 F3), Registrierung in `supabase_migrations.schema_migrations`
-- von Hand (114, 117, 120).

begin;

-- a) ------------------------------------------------------------------------
create or replace function public.staende_offen(p_hunt_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select h.map_open
        or h.status in ('active', 'paused')
        or h.started_at is not null
        or exists (select 1
                     from public.hunt_drives d
                    where d.hunt_id = h.id
                      and d.started_at is not null)
        or (h.scheduled_for is not null
            and now() >= h.scheduled_for - interval '1 hour')
      from public.hunts h
     where h.id = p_hunt_id), false);
$$;

comment on function public.staende_offen(uuid) is
  'CP-116 (146): Sind die Staende der Jagd fuer Nicht-Leitung offen? Freigabe '
  '(map_open), laufend, gestartet, Treiben gestartet oder ab scheduled_for - 1 h. '
  'Intern: EXECUTE fuer niemanden, nur aus DEFINER-Sichtfunktionen.';

revoke execute on function public.staende_offen(uuid)
  from public, anon, authenticated, service_role;

-- b) ------------------------------------------------------------------------
create or replace function public.staende_der_teilnahme(p_teilnahme uuid)
returns table(objekt_id uuid, sitz_id uuid, ort geometry)
language sql
stable security definer
set search_path = public, extensions, pg_temp
as $$
  with t as (
    select p.id, p.hunt_id, p.user_id,
           h.district_id, h.creator_id, d.owner_id
      from public.hunt_participants p
      join public.hunts h on h.id = p.hunt_id
      left join public.districts d on d.id = h.district_id
     where p.id = p_teilnahme
       and p.entfernt_am is null
       -- 146 (CP-116): vor der Freigabe hat eine Teilnahme keine Staende.
       and public.staende_offen(p.hunt_id)
  ),
  treiben_staende as (
    select ds.map_object_id, ds.seat_assignment_id
      from t
      join public.hunt_drives dr on dr.hunt_id = t.hunt_id
      join public.hunt_drive_stands ds
        on ds.drive_id = dr.id and ds.participant_id = t.id
  ),
  sitze as (
    select s.id, s.seat_id, s.position_lat, s.position_lng
      from t
      join public.hunt_seat_assignments s
        on s.hunt_id = t.hunt_id and s.user_id = t.user_id
    union
    select s.id, s.seat_id, s.position_lat, s.position_lng
      from t
      join treiben_staende ts on true
      join public.hunt_seat_assignments s
        on s.id = ts.seat_assignment_id and s.hunt_id = t.hunt_id
  ),
  objekte as (
    select s.seat_id as objekt_id, s.id as sitz_id
      from sitze s
     where s.seat_id is not null
    union
    select ts.map_object_id, null::uuid
      from treiben_staende ts
     where ts.map_object_id is not null
  )
  select o.id, ob.sitz_id, o.position
    from objekte ob
    join public.map_objects o on o.id = ob.objekt_id
    join t on o.district_id = t.district_id
   where o.deleted_at is null
     and (t.creator_id = t.owner_id
          or public.schein_deckt_objekt(t.creator_id, o.district_id,
                                        o.id, o.position))
  union all
  select null::uuid, s.id,
         st_setsrid(st_makepoint(s.position_lng, s.position_lat), 4326)
    from sitze s
   where s.seat_id is null
     and s.position_lat is not null
     and s.position_lng is not null;
$$;

-- c) ------------------------------------------------------------------------
create or replace function public.stand_zeile_in_sicht(p_hunt_id uuid, p_objekt uuid, p_sitz uuid, p_teilnehmer uuid, p_nutzer uuid)
returns boolean
language sql
stable security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    -- 146 (CP-116): die Leitung vorweg, alle anderen erst bei offener Grenze —
    -- auch fuer die eigene Zeile (p_nutzer/p_teilnehmer).
    st.stufe = 'leitung'
    or (public.staende_offen(p_hunt_id)
        and (
    p_nutzer = auth.uid()
    or exists (select 1 from public.hunt_participants p
                where p.id = p_teilnehmer and p.user_id = auth.uid())
    or st.stufe in ('leitung', 'alles')
    or (st.stufe in ('eigener', 'umkreis')
        and exists (select 1
                      from public.staende_der_teilnahme(
                             public.meine_teilnahme(p_hunt_id)) e
                     where e.objekt_id = p_objekt or e.sitz_id = p_sitz))
    or (st.stufe = 'umkreis'
        and public.ort_in_umkreis(p_hunt_id, coalesce(
              (select o.position
                 from public.map_objects o
                 join public.hunts h on h.id = p_hunt_id
                where o.id = p_objekt
                  and o.district_id = h.district_id
                  and o.deleted_at is null
                  and (exists (select 1
                                 from public.hunt_seat_assignments s2
                                where s2.hunt_id = p_hunt_id
                                  and s2.seat_id = o.id)
                       or exists (select 1
                                    from public.hunt_drive_stands ds2
                                    join public.hunt_drives d2
                                      on d2.id = ds2.drive_id
                                   where d2.hunt_id = p_hunt_id
                                     and ds2.map_object_id = o.id))),
              (select case
                        when s.seat_id is null then
                             st_setsrid(st_makepoint(s.position_lng,
                                                     s.position_lat), 4326)
                        else o.position
                      end
                 from public.hunt_seat_assignments s
                 join public.hunts h on h.id = s.hunt_id
                 left join public.map_objects o
                        on o.id = s.seat_id
                       and o.district_id = h.district_id
                       and o.deleted_at is null
                where s.id = p_sitz
                  and s.hunt_id = p_hunt_id))))
        )),
    false)
    from (select public.sicht_stufe(p_hunt_id) as stufe) st;
$$;

-- d) ------------------------------------------------------------------------
create or replace function public.sitz_in_sicht(p_sitz uuid)
returns boolean
language sql
stable security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select (s.user_id = auth.uid()
            and s.hunt_id in (select public.get_my_teilnahme_hunt_ids())
            -- 146 (CP-116): auch die eigene Sitzzeile erst bei offener Grenze,
            -- ausser fuer die Leitung (auch `left`, s. Kopf d).
            and (public.staende_offen(s.hunt_id)
                 or public.sicht_stufe(s.hunt_id) = 'leitung'))
        or (s.hunt_id in (select public.get_my_joined_hunt_ids())
            and public.stand_zeile_in_sicht(s.hunt_id, s.seat_id, s.id, null,
                                            s.user_id))
      from public.hunt_seat_assignments s
     where s.id = p_sitz), false);
$$;

-- e) ------------------------------------------------------------------------
drop policy seat_assignments_participant_select on public.hunt_seat_assignments;
create policy seat_assignments_participant_select
  on public.hunt_seat_assignments
  for select
  to authenticated
  using (public.sitz_in_sicht(id));

commit;
