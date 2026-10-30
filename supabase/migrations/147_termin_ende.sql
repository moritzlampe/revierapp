-- 147: Das Termin-Ende beendet die Gruppenjagd (CN-109).
--
-- ANLASS: `hunts.scheduled_until` war seit 095/102 kein Endtermin, es setzte
-- nur den 12-h-Deckel von `auto-end-stale-hunts` aus. Jede Live-Position einer
-- Gruppenjagd hebt `last_activity_at` (`trg_positions_current_activity`) —
-- eine Gruppenjagd, in der noch jemand ortet, endete also nie von selbst
-- (gemessen 08.09.2026: „Test mehrtaegig", Ende 14:00, um 14:21 weiter aktiv).
-- Moritz 28.10.2026: das Termin-Ende wird ein echtes Ende.
-- Bauplan (F14, Codex + Schlusslesung auf Fassung 1, Delta auf Fassung 2,
-- FREIGEGEBEN 30.10.2026):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Termin_Ende_V1.md (E2)
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/147_termin_ende.md
--
--
-- DIE REGEL IN VIER SAETZEN
--
-- 1. Ein neuer Job `auto-end-planned-hunts` beendet jede Minute jede
--    GRUPPENjagd, die laeuft (`active`/`paused`) und deren `scheduled_until`
--    erreicht ist: `status = 'auto_completed'`, `ended_at` nach der Regel in 3.
-- 2. Einzeljagden NICHT: eine geplante Einzeljagd hat keinen Reiter „Regeln"
--    und damit keinen Weg, ihr Ende zu aendern; sie endet ohnehin ueber das
--    Ruhefenster ihres Erstellers ab der letzten Meldung (134). `scheduled`
--    NICHT: eine nie angeblasene Jagd startet der 4-h-Job (060), dieser Job
--    beendet sie danach (Bauplan E5). `draft` NICHT: ein Entwurf ist keine
--    laufende Jagd; der 4-h-Job startet ihn nie, der Stale-Job erfasst ihn
--    wie bisher (Codex 147, Punkt 6).
-- 3. `ended_at` folgt in BEIDEN Jobs derselben Regel: Frist der Einzeljagd
--    (134) vor geplantem Ende der Gruppenjagd vor letzter Aktivitaet.
--    `auto-end-stale-hunts` bekommt sie per `cron.alter_job`; sonst
--    entschiede die Reihenfolge der Jobs am :00/:30-Tick, ob eine Jagd um
--    07:45 (letzte Aktivitaet) oder um 20:00 (Ende) endet (Codex Bauplan
--    Punkt 2, hoch). Gleich ist der Wert fuer jede Zeile, deren Ende zur
--    Startzeit BEIDER Laeufe erreicht ist. Vor dem Ende verschont der
--    Stale-Job eine geplante Jagd ueber seine Ausnahme; nur eine Jagd OHNE
--    `scheduled_for` oder mit verletztem 16-Tage-Deckel faellt nicht darunter
--    — die sammelt er nach 12 h Ruhe schon vor dem Ende ein und schreibt die
--    letzte Aktivitaet. Richtig: sie endete an ihrer Ruhe, nicht am Termin
--    (Codex 147 Punkt 3, Schlusslesung 147 Punkt 2).
-- 4. `greatest(…, started_at)`: eine Jagd, die erst NACH ihrem Ende
--    angeblasen wurde, endet mit ihrem Start (Dauer 0), nie davor.
--
--
-- WAS DIESE MIGRATION BEWUSST NICHT TUT
--
--   * Kein Riegel gegen ein Ende in der Vergangenheit oder vor dem Start
--     (095/107: die Reihenfolge gehoert ins Formular). Ein solches Ende
--     beendet eine laufende Gruppenjagd in der naechsten Minute.
--   * Keine Aenderung an `activate-scheduled-hunts` (060) und an
--     `auto-end-solo-hunts` (134).
--   * Keine Aenderung an der Ausnahme, den 16-Tage-Deckeln und dem
--     Ruhefenster im Stale-Job — sein Rumpf aus 134 steht unten WOERTLICH,
--     geaendert ist nur der `ended_at`-Ausdruck und sein Kommentar.
--   * Keine Aenderung an Clients. Der Job wirkt auch fuer alte Builds; sie
--     sehen das Server-Ende wie heute das Stale-Ende („Jagd abgeblasen").
--
--
-- FOLGEN, BENANNT
--
--   * Bestand beim Schreiben (30.10.2026): 0 laufende Jagden, 1 geplante
--     (01.12., Ende 23:59, Moritz). Die Migration beendet beim Applizieren
--     nichts — der Probelauf misst es erneut.
--   * Alte Builds (≤ 58) koennen weiter Gruppenjagden planen, deren
--     voreingestelltes Ende jetzt greift, ohne Hinweis und ohne
--     Aenderungsweg — hingenommen (Moritz 30.10.2026, Bauplan E10 a).
--   * `cron.job_run_details`: +1.440 Zeilen am Tag, nach 7 Tagen geloescht
--     (`cron-protokoll-aufraeumen`, 134).
--   * Mit dem Ende sind Freigabe und Jagdregeln fest (138,
--     `trg_hunts_freigabe_pruefen`) — kuenftig also schon zum Termin-Ende,
--     nicht erst, wenn jemand beendet (Codex 147, Punkt 6).
--   * Der Job feuert beim Beenden dieselben Trigger wie der Stale-Job heute:
--     `trg_hunts_anonym_fest` (143), `trg_hunts_close_drives`,
--     `trg_hunts_stand_bezug_clear`; BEFORE laeuft `trg_hunts_endtermin` (107)
--     mit und bricht am Statusvergleich ab (Rumpf bleibt tabellenfrei).
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 147_termin_ende.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⚠ Am Tag des nativen Builds applizieren (Bauplan E10 a), nicht vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Job: Gruppenjagd am Termin-Ende beenden (jede Minute)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'auto-end-planned-hunts',
  '* * * * *',
  $job$
    UPDATE public.hunts
       SET status   = 'auto_completed',
           -- 147 (CN-109): dieselbe ended_at-Regel wie auto-end-stale-hunts.
           -- Wer sie aendert, aendert beide Jobs — sonst entscheidet die
           -- Reihenfolge der Laeufe ueber das Ende.
           ended_at = CASE WHEN auto_ende_am IS NOT NULL
                           THEN greatest(auto_ende_am, started_at)
                           WHEN kind = 'group'
                            AND scheduled_until IS NOT NULL
                            AND scheduled_until <= now()
                           THEN greatest(scheduled_until, started_at)
                           ELSE last_activity_at END
     WHERE kind = 'group'
       AND status IN ('active', 'paused')
       AND ended_at IS NULL
       AND scheduled_until IS NOT NULL
       AND scheduled_until <= now()
  $job$
);

-- Unter fremder Rolle legte `cron.schedule` einen Job mit fremdem
-- `username` an (108-Muster) — dann lieber abbrechen als still doppelt.
do $$
begin
  if (select count(*) from cron.job where jobname = 'auto-end-planned-hunts') <> 1
     or not exists (select 1 from cron.job
                     where jobname = 'auto-end-planned-hunts'
                       and username = 'postgres') then
    raise exception '147: auto-end-planned-hunts nicht genau einmal unter postgres angelegt';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Job `auto-end-stale-hunts`: dieselbe ended_at-Regel
-- ---------------------------------------------------------------------------
--
-- Der Rumpf aus 134, vollstaendig wiederholt (`cron.alter_job` setzt ihn als
-- Ganzes), mit EINER Aenderung: der `ended_at`-Ausdruck bekommt den Zweig
-- fuer das geplante Ende einer Gruppenjagd. Er greift nur, wenn die Ausnahme
-- unten wegen `now() >= scheduled_until` entfallen ist; faellt sie nur an
-- einem Deckel (Ende noch vor uns), bleibt es bei `last_activity_at`.

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
        -- 147 (CN-109): dasselbe fuer das geplante Ende einer Gruppenjagd
        -- (auto-end-planned-hunts). Dieselbe Regel in beiden Jobs.
        ended_at = CASE WHEN auto_ende_am IS NOT NULL
                        THEN greatest(auto_ende_am, started_at)
                        WHEN kind = 'group'
                         AND scheduled_until IS NOT NULL
                         AND scheduled_until <= now()
                        THEN greatest(scheduled_until, started_at)
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

commit;
