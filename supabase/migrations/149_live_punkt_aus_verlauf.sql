-- 149: Live-Punkt aus dem Verlauf nachziehen (CN-461).
--
-- Bauplan (F14, Codex + Schlusslesung, FREIGEGEBEN 09.11.2026):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Live_Punkt_aus_Verlauf_V1.md
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/149_live_punkt_aus_verlauf.md
--
-- ANLASS
--
-- Gruppenjagd am 07.11.2026: Die Karte des Jagdleiters zeigte einen Schuetzen
-- rund drei Stunden lang 82 m vor seinem Stand. Der Verlauf (`positions`) trug
-- den richtigen Punkt seit 09:38, der Live-Punkt (`positions_current`) blieb
-- auf 09:34 stehen. Die App schickt beide getrennt; der Live-Punkt geht bei
-- jedem Neustart der Ortung und an seiner Frist verloren, der Verlauf an
-- anderen Stellen. Dieser Trigger macht den Verlauf zu einem zweiten Kanal
-- fuer den Live-Punkt.
--
-- WAS DER TRIGGER TUT
--
-- Nach jedem eingefuegten Schub (ein PostgREST-Bulk-INSERT ist EIN Statement,
-- bis 200 Zeilen) je Teilnehmer der juengste Punkt mit `is_locked` (< 10 m)
-- als Live-Punkt, aber nur wenn er NEUER ist als der vorhandene. Derselbe
-- Spaltensatz wie der Live-Upsert der App (kein heading/speed). `hunt_id`
-- kommt aus der Teilnahme, nie aus der Verlaufzeile: `positions_insert_own`
-- laesst eine fremde `hunt_id` neben der eigenen Teilnahme zu.
--
-- WANN NICHT
--
-- Teilnahme nicht `joined` (Guertel zu `positions_insert_own`); abgemeldet
-- (`ortung_pausiert_seit`, 126 -- sonst holte ein Nachzuegler den geloeschten
-- Punkt zurueck); Consent `none` (sonst legte ein Schlussflush nach
-- `deleteOwnPositions` die Zeile neu an); Jagd nicht `active`/`paused`.
--
-- FEHLER
--
-- Der Verlauf darf am Live-Punkt nie scheitern. Der ganze Rumpf steht in einem
-- Ausnahmeblock, der als WARNING meldet und den Schub durchlaesst.
-- `when others` faengt `query_canceled` NICHT; deshalb `lock_timeout 500ms`:
-- ein Warten auf die gesperrte Live-Zeile endet als 55P03, und das wird
-- gefangen.
--
-- RECHTE
--
-- SECURITY INVOKER: Wer den Verlauf schreiben darf (eigener Teilnehmer,
-- `joined`), darf nach `positions_current_upsert_own` auch den Live-Punkt
-- schreiben. Keine Rechteerweiterung. EXECUTE entzogen (082-Muster; geprueft
-- wird beim Anlegen des Triggers, nicht beim Feuern).
--
-- NEUE WIRKUNG
--
-- Ein Schub, der einen neueren Live-Punkt bringt, hebt ueber
-- `trg_positions_current_activity` `last_activity_at` der Gruppenjagd -- wie
-- ein gelungener Wiederholungsversuch der App. Einzeljagden ausgenommen (134).

begin;

-- Applizieren darf den Betrieb nicht stauen (Codex 149, P6): wer laenger als
-- 5 s auf `positions` warten muesste, bricht ab und wird wiederholt.
set local lock_timeout = '5s';

create or replace function public.live_punkt_aus_verlauf()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public', 'pg_temp'
  set lock_timeout to '500ms'
as $function$
begin
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
  return null;
end;
$function$;

comment on function public.live_punkt_aus_verlauf() is
  '149 (CN-461): zieht nach jedem Verlauf-Schub den Live-Punkt nach, wenn neuer. Nur als Trigger.';

-- `create or replace` (PG 14+, Produktion 17.6) statt `drop … if exists` +
-- `create`: wiederholbar ohne AccessExclusiveLock auf `positions` (Codex P6).
create or replace trigger trg_positions_live_punkt
  after insert on public.positions
  referencing new table as neu
  for each statement
  execute function public.live_punkt_aus_verlauf();

revoke all on function public.live_punkt_aus_verlauf()
  from public, anon, authenticated, service_role;

commit;
