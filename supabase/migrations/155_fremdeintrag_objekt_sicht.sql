-- 155: Fremdeintrag und Treibenwechsel geben die Koordinate eines Stand-OBJEKTS
-- an Nicht-Leitung erst heraus, wenn die Karte das Objekt auch zeigt (CN-499,
-- Rest aus 153, Schlusslesung 153 B1).
--
-- ANLASS: 153 bindet den Ort an die Sicht auf die Stand-ZEILE
-- (`stand_zeile_in_sicht`: Leitung, sonst `staende_offen` + Sichtstufe aus 141).
-- Die Koordinate kommt aber aus `map_objects`, und dort gilt `objekt_in_sicht`:
-- fuer `alles`/`umkreis` erst mit `jagd_ist_offen` (Jagdtag ab 0 Uhr Berlin oder
-- laufend). Gibt die Leitung die Staende Tage vor der Jagd frei (`map_open`),
-- sieht ein Gruppenleiter die Zuteilung, die Karte zeigt ihm den Hochsitz aber
-- erst am Jagdtag -- per API-Fremdeintrag las er die Koordinate trotzdem ab
-- (gemessen in Probe Q23 zu 153: Stand-Zeile 1, `map_objects` 0, Ort M1).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/155_fremdeintrag_objekt_sicht.md
--
--
-- DIE REGEL
--
-- Im `map_objects`-Join beider Hilfsfunktionen gilt fuer den Aufrufer
-- zusaetzlich:
--     sicht_stufe(hunt) = 'leitung'
--  or hunts.started_at is not null
--  or objekt_in_sicht(o.id)
-- `objekt_in_sicht` ist die Sicht ueber die Jagdteilnahme -- dieselbe Funktion,
-- die die Policy `map_objects_hunt_member` traegt (die Revierkarte kennt daneben
-- Besitz, Begehungsschein und Ersteller; s. Preis 3). Davor zwei Zusaetze, die
-- sie allein nicht hat:
--   - Leitung dieser Jagd immer, auch ohne Teilnahme (Revierbesitzer, 153 B4;
--     `objekt_in_sicht` verlangt eine Teilnahme).
--   - Sobald die Jagd lief (`started_at`), immer: Nachtraege nach Jagdende.
--     Dort wird `jagd_ist_offen` falsch und die Karte zeigt einem
--     Gruppenleiter das Objekt nicht mehr; der Ort ist dort gewollt (153 Preis 5).
-- Fehlt das Objekt, liefert die Hilfsfunktion fuer einen Stand aus
-- `map_objects` null, und es greift der naechste Ort der Kette.
--
--
-- WARUM NICHT DER VORSCHLAG AUS DEM BACKLOG (`jagd_ist_offen` dieser Jagd)
--
-- Er prueft nur DIESE Jagd. Ein Gruppenleiter, der das Objekt ueber eine andere,
-- laufende Jagd im selben Revier ohnehin auf der Karte sieht, verloere den Ort
-- -- ohne dass es ein Leck gaebe (153-Proben Q10/Q11 kippten). `objekt_in_sicht`
-- fragt dasselbe wie die Karte. Die Frage WELCHE Staende beantwortet weiter
-- `stand_zeile_in_sicht` (153); 155 schliesst nur die Sicht auf das OBJEKT.
--
--
-- UNVERAENDERT
--
-- - Aufrufer: `set_kill_herkunft` (Fremdzweig) und `erlegung_kontrollieren`
--   (Treibenwechsel) -- die einzigen (Produktion, `prosrc`).
-- - Die Kette: Treiben-Stand -> Jagdsitz -> GPS des Clients -> ohne Ort.
-- - Ad-hoc-Sitze (`seat_id` null, Koordinate in der Sitzzeile): die Koordinate
--   steht in der ZEILE selbst; deren Sicht regelt 153.
-- - Signatur, `stable`, INVOKER, `search_path`, Eigentuemer und Rechte: wie vorher
--   (CREATE OR REPLACE behaelt ACL und Owner).
--
--
-- BENANNTE PREISE
--
-- 1. Ein Gruppenleiter, der vor dem Jagdtag (Freigabe offen) einen
--    Fremdeintrag anlegt, bekommt keinen Objekt-Ort, sondern einen Ad-hoc-Sitz
--    oder keinen -- es sei denn, er sieht das Objekt ueber eine andere Jagd. Der
--    Client (Block B 2b) bietet das Eintragen dann AN und schickt vor dem
--    Jagdtag keinen eigenen GPS-Punkt: ohne Ad-hoc-Sitz bleibt das Stueck ohne
--    Ort (Schlusslesung 155 B1, Codex-Delta D-1). Ob der Client vor dem Jagdtag
--    sperrt, ist eine eigene Entscheidung (CN-505).
-- 2. `started_at` gilt als "einmal gelaufen". Bleibt es nach einem
--    Zuruecksetzen der Jagd stehen, gilt die Jagd fuer den Ort weiter als
--    gelaufen. Gewollt: einmal gelaufen, sind die Staende bekannt. Schreiben
--    duerfen es nur Ersteller, beigetretene Jagdleiter und der Cron beim Start
--    (060); Bestand 14.11.2026: 0 geplante Jagden mit `started_at`.
-- 3. Wer ein Objekt nur ueber Besitz, Begehungsschein oder Ersteller-Policy
--    auf der Revierkarte sieht, nicht ueber die Jagd, bekommt den Objekt-Ort vor
--    dem Jagdtag trotzdem nicht (Schlusslesung 155 B2). Kein Leck; die Leitung
--    hat den eigenen Zweig.

begin;

create or replace function public.stand_ort_im_treiben(p_teilnahme uuid, p_treiben uuid)
 returns geometry
 language sql
 stable
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select coalesce(
           o.position,
           case when s.id is not null and s.seat_id is null
                 and s.position_lat is not null and s.position_lng is not null
                then st_setsrid(st_makepoint(s.position_lng, s.position_lat), 4326)
           end)
    from public.hunt_drive_stands ds
    join public.hunt_drives dr on dr.id = ds.drive_id
    join public.hunts h on h.id = dr.hunt_id
    left join public.districts d on d.id = h.district_id
    left join public.hunt_seat_assignments s
           on s.id = ds.seat_assignment_id and s.hunt_id = dr.hunt_id
    left join public.map_objects o
           on o.id = coalesce(ds.map_object_id, s.seat_id)
          and o.district_id = h.district_id
          and o.deleted_at is null
          and (h.creator_id = d.owner_id
               or public.schein_deckt_objekt(h.creator_id, o.district_id, o.id, o.position))
          -- 155 (CN-499): das Objekt nur, wenn die Karte es zeigt; Leitung
          -- immer, nach dem Start der Jagd immer (Nachtraege).
          and (public.sicht_stufe(h.id) = 'leitung'
               or h.started_at is not null
               or public.objekt_in_sicht(o.id))
   where ds.drive_id = p_treiben
     and ds.participant_id = p_teilnahme
     -- 153 (CN-498): nur ein Stand, den der Aufrufer sieht (Argumente wie
     -- `treiben_stand_in_sicht`).
     and public.stand_zeile_in_sicht(dr.hunt_id, ds.map_object_id,
                                     ds.seat_assignment_id, ds.participant_id, null);
$function$;

create or replace function public.sitz_ort_der_jagd(p_teilnahme uuid)
 returns geometry
 language sql
 stable
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select coalesce(
           o.position,
           case when s.seat_id is null
                 and s.position_lat is not null and s.position_lng is not null
                then st_setsrid(st_makepoint(s.position_lng, s.position_lat), 4326)
           end)
    from public.hunt_participants t
    join public.hunt_seat_assignments s
      on s.hunt_id = t.hunt_id and s.user_id = t.user_id
    join public.hunts h on h.id = t.hunt_id
    left join public.districts d on d.id = h.district_id
    left join public.map_objects o
           on o.id = s.seat_id
          and o.district_id = h.district_id
          and o.deleted_at is null
          and (h.creator_id = d.owner_id
               or public.schein_deckt_objekt(h.creator_id, o.district_id, o.id, o.position))
          -- 155 (CN-499): das Objekt nur, wenn die Karte es zeigt; Leitung
          -- immer, nach dem Start der Jagd immer (Nachtraege).
          and (public.sicht_stufe(h.id) = 'leitung'
               or h.started_at is not null
               or public.objekt_in_sicht(o.id))
   where t.id = p_teilnahme
     -- 153 (CN-498): nur ein Sitz, den der Aufrufer sieht (Argumente wie der
     -- Fremd-Zweig von `sitz_in_sicht`).
     and public.stand_zeile_in_sicht(s.hunt_id, s.seat_id, s.id, null, s.user_id);
$function$;

commit;
