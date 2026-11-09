-- 150: Ungenauer, aber neuerer Ort neben dem Live-Punkt (CN-466).
--
-- Bauplan (F14, Codex x3 + Schlusslesung, FREIGEGEBEN 09.11.2026, Fassung 5):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Punkt_Verlaesslichkeit_V1.md
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/150_ungenauer_ort.md
--
-- ANLASS
--
-- Der Live-Punkt (`positions_current`) nimmt nur Fixe unter 10 m. Unter
-- Kronendach liefert ein Handy oft ueber Minuten nur 10-50 m; die Karte zeigt
-- den Menschen dann am letzten genauen Ort, auch wenn er laengst woanders ist,
-- und das sieht verlaesslich aus. Moritz (09.11.2026): "da ist der ungenauere
-- standort (aber so ausgewiesen) ja besser als der falsche genaue".
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Drei Spalten `ungenau_location`, `ungenau_accuracy`, `ungenau_at` an
--    `positions_current`, alle NULL-faehig. Heutige Leser (App, PWA,
--    `revier_praesenz`) lesen sie nicht; der Live-Upsert der Clients nennt
--    sie nicht und laesst sie beim Konflikt stehen. Sichtbar wird erst etwas
--    mit dem Build, der sie liest.
-- 2. BEFORE-UPDATE-Trigger: speichert ein Schreiber einen NEUEREN genauen Ort
--    als den ungenauen (`updated_at` rueckt vor und ueberholt `ungenau_at`),
--    werden die drei Spalten geleert. Gilt fuer jeden Schreiber (Live-Upsert
--    der App, PWA, Anweisung 1 des Verlauf-Triggers). Scheitert das
--    Speichern, wird nichts geleert.
-- 3. Zweite Anweisung im Verlauf-Trigger aus 149, im EIGENEN Ausnahmeblock:
--    je Teilnahme der juengste Fix mit 10 <= Genauigkeit <= 50 (U).
--    - Einsteigen: es gilt noch kein ungenauer Ort, U ist neuer als der
--      Live-Punkt und liegt nachweislich woanders:
--      Abstand > Genauigkeit U + Genauigkeit Live-Punkt + 25 m
--      (Moritz' Regel, dazu der gemessene Zuschlag aus M8/M11).
--    - Folgen: es gilt schon ein ungenauer Ort und U ist neuer -> ohne
--      Schwelle uebernehmen (der Kreis folgt beim Gehen).
--    `updated_at` bleibt dabei stehen; die Anweisung loest das Leeren also
--    nicht selbst aus. Ohne vorhandene Live-Zeile wird nichts angelegt
--    (`location` ist NOT NULL; CN-472).
--
-- ANZEIGE (App, nicht hier): ungenau zeigen genau dann, wenn
-- `ungenau_at > updated_at` und die Genauigkeit gueltig ist.
--
-- FEHLER
--
-- Wie 149: der Verlauf darf am Live-Punkt nie scheitern, und Anweisung 2
-- darf Anweisung 1 nicht mitnehmen. Deshalb je Anweisung ein eigener
-- Ausnahmeblock mit WARNING. `lock_timeout 500ms` bleibt tragend
-- (`query_canceled` wird nicht gefangen, 55P03 schon).
--
-- RECHTE
--
-- Beide Funktionen INVOKER, EXECUTE namentlich entzogen (082). Die Spalten
-- erben die Tabellenrechte: der Besitzer der Live-Zeile (Policy
-- `positions_current_upsert_own`) kann sie selbst schreiben. Das ist keine
-- neue Faehigkeit, er kann heute schon `location` frei setzen.
--
-- `st_distance` und `geography` liegen in `extensions`, daher der
-- search_path der Funktion (Schlusslesung F1 zum Bauplan).

begin;

set local lock_timeout = '5s';

-- 1. Spalten ------------------------------------------------------------------

alter table public.positions_current
  add column if not exists ungenau_location extensions.geometry(Point, 4326),
  add column if not exists ungenau_accuracy double precision,
  add column if not exists ungenau_at       timestamptz;

comment on column public.positions_current.ungenau_location is
  '150 (CN-466): juengster ungenauer Ort (10-50 m), der nachweislich woanders liegt als location. Gilt nur, solange ungenau_at > updated_at.';
comment on column public.positions_current.ungenau_accuracy is
  '150 (CN-466): Genauigkeit in m zu ungenau_location.';
comment on column public.positions_current.ungenau_at is
  '150 (CN-466): Fixzeit zu ungenau_location. Geleert, sobald ein neuerer genauer Ort gespeichert wird.';

-- 2. Leeren bei neuerem genauen Ort -------------------------------------------

create or replace function public.ungenau_ort_leeren()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Nur wenn dieser Schreiber den genauen Ort tatsaechlich VORRUECKT und
  -- dabei den ungenauen ueberholt. Die zweite Anweisung des Verlauf-Triggers
  -- laesst updated_at stehen und faellt deshalb nie hierher.
  if new.updated_at > coalesce(old.updated_at, '-infinity'::timestamptz)
     and new.updated_at > old.ungenau_at then
    new.ungenau_location := null;
    new.ungenau_accuracy := null;
    new.ungenau_at       := null;
  end if;
  return new;
end;
$function$;

comment on function public.ungenau_ort_leeren() is
  '150 (CN-466): leert ungenau_* an positions_current, sobald ein neuerer genauer Ort gespeichert wird. Nur als Trigger.';

create or replace trigger trg_positions_current_ungenau_leeren
  before update on public.positions_current
  for each row
  execute function public.ungenau_ort_leeren();

revoke all on function public.ungenau_ort_leeren()
  from public, anon, authenticated, service_role;

-- 3. Verlauf-Trigger aus 149 um die zweite Anweisung erweitert ---------------

create or replace function public.live_punkt_aus_verlauf()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public', 'extensions', 'pg_temp'
  set lock_timeout to '500ms'
as $function$
begin
  -- Anweisung 1 (149, unveraendert): juengster genauer Punkt als Live-Punkt.
  begin
    insert into public.positions_current as pc
      (participant_id, hunt_id, location, accuracy, is_locked, updated_at)
    select k.participant_id, hp.hunt_id, k.location, k.accuracy, true, k.recorded_at
      from (
        select distinct on (n.participant_id)
               n.participant_id, n.location, n.accuracy, n.recorded_at
          from neu n
         where n.is_locked is true
           and n.recorded_at is not null
           and n.location is not null
         order by n.participant_id, n.recorded_at desc
      ) k
      join public.hunt_participants hp on hp.id = k.participant_id
      join public.hunts h on h.id = hp.hunt_id
     where hp.status = 'joined'
       and hp.ortung_pausiert_seit is null
       and hp.position_consent is distinct from 'none'
       and h.status in ('active', 'paused')
    on conflict (participant_id) do update
       set hunt_id    = excluded.hunt_id,
           location   = excluded.location,
           accuracy   = excluded.accuracy,
           is_locked  = excluded.is_locked,
           updated_at = excluded.updated_at
     where coalesce(pc.updated_at, '-infinity'::timestamptz) < excluded.updated_at;
  exception when others then
    raise warning 'live_punkt_aus_verlauf: % % -- Teilnahmen %; Verlauf bleibt, Live-Punkt nicht nachgezogen',
      sqlstate, sqlerrm,
      (select string_agg(distinct n.participant_id::text, ',') from neu n);
  end;

  -- Anweisung 2 (150): ungenauer Ort. Sieht die Zeile NACH Anweisung 1.
  begin
    update public.positions_current as pc
       set ungenau_location = u.location,
           ungenau_accuracy = u.accuracy,
           ungenau_at       = u.recorded_at
      from (
        select distinct on (n.participant_id)
               n.participant_id, n.location, n.accuracy, n.recorded_at
          from neu n
         where n.is_locked is not true
           and n.recorded_at is not null
           and n.accuracy >= 10
           and n.accuracy <= 50   -- schliesst NaN, Infinity und NULL aus
         order by n.participant_id, n.recorded_at desc
      ) u
      join public.hunt_participants hp on hp.id = u.participant_id
      join public.hunts h on h.id = hp.hunt_id
     where pc.participant_id = u.participant_id
       and hp.status = 'joined'
       and hp.ortung_pausiert_seit is null
       and hp.position_consent is distinct from 'none'
       and h.status in ('active', 'paused')
       -- Ohne updated_at kein ungenauer Ort: sonst fehlte der Riegel gegen
       -- einen verspaeteten aelteren Fix (Codex P2), und die Anzeigeregel
       -- zeigte ihn ohnehin nie.
       and u.recorded_at > pc.updated_at
       and (
         -- Folgen: ein ungenauer Ort gilt schon, U ist neuer.
         (pc.ungenau_at > pc.updated_at and u.recorded_at > pc.ungenau_at)
         or
         -- Einsteigen: noch keiner gilt, U liegt nachweislich woanders.
         -- Genauigkeit des Live-Punkts ausserhalb [0, 10) (NULL, NaN,
         -- negativ, client-bestimmt) zaehlt als 10 m, die Obergrenze fuer
         -- einen genauen Ort.
         (not coalesce(pc.ungenau_at > pc.updated_at, false)
          and st_distance(u.location::geography, pc.location::geography)
              > u.accuracy
                + case when pc.accuracy >= 0 and pc.accuracy < 10
                       then pc.accuracy else 10 end
                + 25)
       );
  exception when others then
    raise warning 'ungenauer_ort: % % -- Teilnahmen %; Verlauf und Live-Punkt bleiben, ungenauer Ort nicht nachgezogen',
      sqlstate, sqlerrm,
      (select string_agg(distinct n.participant_id::text, ',') from neu n);
  end;

  return null;
end;
$function$;

comment on function public.live_punkt_aus_verlauf() is
  '149 (CN-461) + 150 (CN-466): zieht nach jedem Verlauf-Schub den Live-Punkt nach, wenn neuer, und den ungenauen Ort nach Moritz'' Regel (+25 m). Nur als Trigger.';

revoke all on function public.live_punkt_aus_verlauf()
  from public, anon, authenticated, service_role;

commit;
