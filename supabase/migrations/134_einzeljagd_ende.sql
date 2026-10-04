-- 134: Einzeljagd — Ende nach der Meldung, Bewegung zaehlt nicht,
--      Ruhefenster je Person (CN-283).
--
-- ANLASS: Max' "Einzeljagd · 02.10." entstand per Tipp auf den
-- Erlegungsknopf, bekam nie eine Meldung und lief 28 h mit 15.714
-- Positionen — Autofahrten inklusive. Jeder Live-Punkt schob
-- `last_activity_at` nach, der 12-h-Cron griff nie (CN-109). 13 von 15
-- Einzeljagden der letzten 30 Tage hatten keine einzige Meldung.
-- Bauplan (F14, drei Runden, Entscheidungen Moritz 03.10.2026):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Einzeljagd_Ende_V1.md §10/§11
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/134_einzeljagd_ende.md
--
--
-- DIE REGEL IN FUENF SAETZEN
--
-- 1. Eine Einzeljagd, die die App MIT einer Meldung anlegt, traegt
--    `auto_ende_am` und endet von selbst, sobald dieser Zeitpunkt erreicht
--    ist: Meldezeit + 2 min, gedeckelt auf Serverzeit + 2 min. Ein Job
--    jede Minute beendet sie, `ended_at = greatest(auto_ende_am,
--    started_at)`.
-- 2. "Weiterjagen" setzt `auto_ende_am` auf NULL — nur, solange die Frist
--    noch nicht erreicht ist. Danach ist es eine normale Einzeljagd.
-- 3. Bei Einzeljagden zaehlt BEWEGUNG (`positions_current`) nicht mehr als
--    Aktivitaet. Erlegungen (und ihre Aenderung) zaehlen weiter, Anblicke
--    zaehlen neu — bei JEDER Jagdart, wie eine Erlegung.
-- 4. Der 12-h-Job nimmt bei Einzeljagden das Ruhefenster des Erstellers
--    (`user_settings.einzeljagd_ruhe_stunden`, 2/4/8/12/24, Standard 12);
--    alle anderen Jagden: unveraendert 12 h, Mehrtages-Ausnahme unveraendert.
-- 5. Die Protokolle der Cron-Jobs werden nach 7 Tagen geloescht.
--
--
-- WAS DIESE MIGRATION BEWUSST NICHT TUT
--
--   * Keine Aenderung an Gruppenjagden ausser Satz 3 (Anblick zaehlt).
--     CN-109 (Bewegung verlaengert eine Gruppenjagd nach ihrem Planende)
--     bleibt offen.
--   * Kein Rueckschreiben von `last_activity_at`. Laufende Einzeljagden
--     enden, sobald ihre letzte Aktivitaet VOR dem Applizieren — bisher auch
--     Positionen — laenger als das Ruhefenster zurueckliegt. Simuliert
--     03.10.2026 ~20:15: eine laufende Jagd (Einzeljagd, letzte Aktivitaet
--     15:47), keine endet beim ersten Lauf. Max' Jagd hat er um 18:52
--     selbst beendet.
--   * Kein Aufraeumen der 13 leeren Einzeljagden und von Max' Positionen —
--     eigene Loeschung, Anker 2, eigene Freigabe.
--   * Keine Aenderung an der PWA. Sie schickt `auto_ende_am` nie (→ NULL,
--     Satz 1 greift nicht). Ihre Einzeljagden zaehlen Bewegung ab jetzt
--     ebenfalls nicht und enden nach dem Ruhefenster des Erstellers.
--   * `cron.schedule` nur fuer die zwei NEUEN Jobs; der bestehende
--     `auto-end-stale-hunts` wird per `cron.alter_job` mit `into strict`
--     geaendert (108-Muster: unter fremder Rolle entstuende sonst ein
--     ZWEITER Job).
--
--
-- FOLGEN, BENANNT
--
--   * Bei Einzeljagden liegt `ended_at = last_activity_at` (= letzte
--     Meldung) VOR den letzten Positionen — gewollt (Codex P3-4).
--   * `cron.job_run_details`: gemessen 03.10.2026 180.161 Zeilen, 83 MB seit
--     14.05.2026, 1.488 je Tag; der neue Minuten-Job verdoppelt die Rate.
--     Der Aufraeum-Job loescht beim ersten Lauf (03:17 UTC) den Bestand
--     bis auf 7 Tage. Es sind Protokollzeilen, keine Daten eines Menschen.
--   * BEFORE-Trigger auf `hunts` feuern alphabetisch: `trg_hunts_auto_ende`
--     liegt zwischen `hunts_creator_id_fest` und `trg_hunts_endtermin`;
--     keiner der bestehenden liest `auto_ende_am`.
--
--
-- `pg_temp` am ENDE jedes search_path (076). REVOKE namentlich (081/082).
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 134_einzeljagd_ende.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build applizieren: der Client schreibt
-- `hunts.auto_ende_am` und liest `user_settings.einzeljagd_ruhe_stunden`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Spalten
-- ---------------------------------------------------------------------------

alter table public.hunts
  add column auto_ende_am timestamptz;

comment on column public.hunts.auto_ende_am is
  'CN-283 (134): Zeitpunkt, zu dem eine mit einer Meldung angelegte '
  'Einzeljagd von selbst endet (Job auto-end-solo-hunts). NULL = kein '
  'automatisches Ende nach der Meldung ("Weiterjagen", PWA, Gruppenjagd). '
  'Gesetzt nur beim INSERT, aufgehoben nur auf NULL vor Ablauf '
  '(Trigger trg_hunts_auto_ende).';

comment on column public.hunts.end_time is
  'Unbenutzt seit 003 — NICHT auto_ende_am (CN-283, 134).';

alter table public.user_settings
  add column einzeljagd_ruhe_stunden integer not null default 12,
  add constraint user_settings_einzeljagd_ruhe_stunden_check
    check (einzeljagd_ruhe_stunden in (2, 4, 8, 12, 24));

comment on column public.user_settings.einzeljagd_ruhe_stunden is
  'CN-283 (134): nach so vielen Stunden ohne Meldung endet eine Einzeljagd '
  'dieses Erstellers (Job auto-end-stale-hunts). Bewegung zaehlt nicht.';

-- ---------------------------------------------------------------------------
-- 2. Die Regel fuer `auto_ende_am`
-- ---------------------------------------------------------------------------
--
-- INSERT: nur Einzeljagden; die Meldezeit gilt, die Serverzeit deckelt —
--   eine vorgehende Geraeteuhr verlaengert nicht, eine Offline-Meldung
--   (Meldezeit weit zurueck) endet beim naechsten Job-Lauf mit
--   `ended_at` = Meldezeit + 2 min statt Sendezeit + 2 min (Schlusslesung
--   EF1: sonst stuende eine Stunden lange Einzeljagd im Tagebuch).
-- UPDATE: unveraendert → durch; auf NULL nur vor Ablauf (Codex E2-8: eine
--   erreichte Frist laesst sich nicht mehr aufheben, auch wenn der Job erst
--   in 59 s laeuft); alles andere → 42501.

create or replace function public.hunts_auto_ende_regel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Der Riegel `is not null` ist noetig: `least(null, x)` ist `x` — ohne
    -- ihn bekaeme jede Einzeljagd ohne Wert (PWA) eine Frist.
    if new.auto_ende_am is not null then
      new.auto_ende_am := case when new.kind = 'solo'
        then least(new.auto_ende_am, now() + interval '2 minutes') end;
    end if;
    return new;
  end if;

  if new.auto_ende_am is not distinct from old.auto_ende_am then
    return new;
  end if;

  -- `clock_timestamp()`, nicht `now()`: `now()` steht auf dem Beginn der
  -- Transaktion; eine lange Transaktion hoebe sonst eine schon erreichte
  -- Frist noch auf (Codex 134, Punkt 1).
  if new.auto_ende_am is null and old.auto_ende_am > clock_timestamp() then
    return new;
  end if;

  raise exception 'Das automatische Ende einer Einzeljagd laesst sich nur vor Ablauf aufheben'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_hunts_auto_ende on public.hunts;
create trigger trg_hunts_auto_ende
  before insert or update of auto_ende_am on public.hunts
  for each row execute function public.hunts_auto_ende_regel();

-- ---------------------------------------------------------------------------
-- 3. Aktivitaet: Bewegung zaehlt bei Einzeljagden nicht
-- ---------------------------------------------------------------------------
--
-- Dieselbe Funktion wie 039 (SECURITY DEFINER, search_path seit 076 mit
-- pg_temp), nur eine Bedingung mehr im WHERE — kein zweiter SELECT
-- (Codex P3-1). `tg_table_name` ist die plpgsql-Variable, `kind` die Spalte
-- von `hunts`. `create or replace` behaelt die Rechte (EXECUTE seit 082
-- entzogen) und die drei bestehenden Trigger.

create or replace function public.update_hunt_last_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.hunt_id is not null then
    update public.hunts
       set last_activity_at = now()
     where id = new.hunt_id
       and ended_at is null
       and last_activity_at < now() - interval '1 minute'
       and not (tg_table_name = 'positions_current' and kind = 'solo');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Aktivitaet: Anblicke zaehlen — NUR `sighting`
-- ---------------------------------------------------------------------------
--
-- Nur fuer `sighting` prueft `pruefe_wild_event_zuordnung` (123), dass der
-- Melder zur Jagd gehoert. Alle anderen Typen kann ein Client per
-- `wild_events_owner_all` mit BELIEBIGER `hunt_id` anlegen (123:150-160) —
-- ohne das WHEN hielte jeder eine fremde Jagd am Leben (Codex P3-2,
-- Schlusslesung V9). Die Spiegelzeile einer Erlegung (`type = 'kill'`)
-- zaehlt ohnehin ueber `kills`.

drop trigger if exists trg_wild_events_activity on public.wild_events;
create trigger trg_wild_events_activity
  after insert on public.wild_events
  for each row
  when (new.type = 'sighting')
  execute function public.update_hunt_last_activity();

-- ---------------------------------------------------------------------------
-- 5. Job: Einzeljagd nach der Meldung beenden (jede Minute)
-- ---------------------------------------------------------------------------
--
-- `greatest(auto_ende_am, started_at)`: `started_at` kommt von der
-- Geraeteuhr, die Frist vom Server — keine negative Dauer (Codex E1-20).

select cron.schedule(
  'auto-end-solo-hunts',
  '* * * * *',
  $job$
    UPDATE public.hunts
       SET status   = 'auto_completed',
           ended_at = greatest(auto_ende_am, started_at)
     WHERE status = 'active'
       AND auto_ende_am IS NOT NULL
       AND auto_ende_am <= now()
  $job$
);

-- ---------------------------------------------------------------------------
-- 6. Job `auto-end-stale-hunts`: Ruhefenster je Ersteller bei Einzeljagden
-- ---------------------------------------------------------------------------
--
-- Der Rumpf aus 108, vollstaendig wiederholt (`cron.alter_job` setzt ihn als
-- Ganzes), mit ZWEI Aenderungen: das Intervall und `ended_at` bei gesetzter
-- Frist. `kind` ist NOT NULL; fehlt
-- die Einstellungszeile, liefert der Subselect NULL → 12.

do $$
declare
  ziel bigint;
begin
  select jobid into strict ziel
    from cron.job
   where jobname = 'auto-end-stale-hunts'
     and username = 'postgres';

  perform cron.alter_job(
    job_id  => ziel,
    active  => true,
    command => $job$
    UPDATE public.hunts
    SET status   = 'auto_completed',
        -- 134 (CN-283): hat die Jagd eine Frist nach der Meldung, gilt DEREN
        -- Ende — auch wenn dieser Job zuerst greift (nach einem Cron-Ausfall
        -- koennen beide Jobs dieselbe Jagd treffen; Codex 134, Punkt 12).
        ended_at = CASE WHEN auto_ende_am IS NOT NULL
                        THEN greatest(auto_ende_am, started_at)
                        ELSE last_activity_at END
    WHERE ended_at IS NULL
      AND status <> 'scheduled'
      -- 134 (CN-283): Einzeljagden mit dem Ruhefenster ihres Erstellers.
      -- Bewegung zaehlt dort nicht mehr (update_hunt_last_activity), also
      -- misst das Fenster ab der letzten Meldung.
      AND last_activity_at < now() - CASE
            WHEN kind = 'solo' THEN make_interval(hours => coalesce(
              (SELECT us.einzeljagd_ruhe_stunden
                 FROM public.user_settings us
                WHERE us.user_id = hunts.creator_id), 12))
            ELSE interval '12 hours'
          END
      -- Die Ausnahme fuer mehrtaegige Jagden. Positiv formuliert und unter
      -- NOT gesetzt, damit keine NULL-Falle entsteht: waeren die Bedingungen
      -- einzeln mit OR verknuepft, ergaebe ein NULL-Operand (etwa
      -- scheduled_for IS NULL) ein NULL statt eines FALSE, und die Zeile
      -- fiele lautlos aus dem WHERE — sie wuerde also verschont statt
      -- eingesammelt, genau falsch herum.
      AND NOT (
            scheduled_for   IS NOT NULL
        AND scheduled_until IS NOT NULL
        AND now() < scheduled_until
        -- Zwei Deckel, seit 108 bei 16 Tagen. Die Zahl deckt die Zeitspanne
        -- ab, die 14 KALENDERTAGE im schlechtesten Fall belegen: Start 00:00,
        -- Ende 23:59 am 14. Tag, und wenn die Herbstumstellung dazwischen
        -- liegt, sind das 15 Tage 00:59 (gemessen). Der RELATIVE begrenzt die
        -- Dauer; er allein genuegt nicht, weil er sich auf `scheduled_for`
        -- stuetzt — eine Spalte, die derselbe Schreiber kontrolliert. Der
        -- ABSOLUTE ist gegen nichts zu stellen, was der Client schreiben kann.
        -- **Er trifft eine legitime Jagd sehr wohl**, naemlich die weit im
        -- Voraus geplante, die jemand heute schon live schaltet (Backlog
        -- A-J4) — bekannt und unveraendert. Hier stand „er trifft keine
        -- legitime Jagd", und das war zu glatt (Fremdpruefung 06.08.2026).
        AND scheduled_until <= scheduled_for + interval '16 days'
        AND scheduled_until <  now() + interval '16 days'
      )
    $job$
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Job: Cron-Protokoll nach 7 Tagen loeschen (taeglich 03:17 UTC)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'cron-protokoll-aufraeumen',
  '17 3 * * *',
  $job$
    DELETE FROM cron.job_run_details
     WHERE end_time < now() - interval '7 days'
  $job$
);

-- ---------------------------------------------------------------------------
-- 8. Rechte
-- ---------------------------------------------------------------------------
--
-- Trigger-Funktion: niemand ruft sie direkt; Postgres prueft EXECUTE beim
-- ANLEGEN des Triggers, nicht beim Feuern (082, gemessen 31.07.2026).
-- `update_hunt_last_activity`: `create or replace` behaelt den Entzug aus 082.

revoke execute on function public.hunts_auto_ende_regel()
  from public, anon, authenticated, service_role;

commit;
