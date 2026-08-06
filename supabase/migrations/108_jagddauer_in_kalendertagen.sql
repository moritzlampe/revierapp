-- 108 — Die Jagddauer zaehlt Kalendertage, nicht 24-Stunden-Bloecke
--
-- ===========================================================================
-- Warum
-- ===========================================================================
--
-- Migration 102 deckelt die Cron-Ausnahme fuer mehrtaegige Jagden auf 14 Tage,
-- zweimal:
--
--   AND scheduled_until <= scheduled_for + interval '14 days'   -- relativ
--   AND scheduled_until <  now()          + interval '14 days'  -- absolut
--
-- Beides sind ZEITSPANNEN. Das Formular waehlt aber KALENDERTAGE, und seit dem
-- 06.08.2026 mit Voreinstellungen: eine Jagd beginnt um 07:00 und endet am
-- gewaehlten Tag um 20:00 (Moritz). „Starttag + 14 Tage" sind damit in
-- Wahrheit **14 Tage und 13 Stunden** — mehr, als der Deckel traegt.
--
-- Der Client musste deshalb bei 13 Tagen klemmen. Moritz am 06.08.2026:
-- *„jetzt ist es nur mit ende 13 tage nach start möglich. 14 tage + die 13
-- stunden sind korrekt geplant."*
--
-- **Die Alternative waere gewesen, den Client bei 13 Tagen zu lassen** — und
-- das war die schlechtere: der Nutzer waehlt Tage, nicht Stunden. Ein Deckel,
-- der „14 Tage" heisst und 13 zulaesst, ist keine Grenze, sondern ein Fehler,
-- den man erklaeren muss.
--
-- ===========================================================================
-- Warum 16 — die Zeitumstellung, und der erste Entwurf lag daneben
-- ===========================================================================
--
-- Die 13 Stunden sind die Folge der VOREINSTELLUNG, nicht der Regel. Beide
-- Uhrzeiten sind aenderbar; der schlechteste Fall ist Start 00:00 und Ende
-- 23:59 am 14. Tag.
--
-- **Der erste Entwurf schloss daraus auf `15 days` und rechnete falsch.** Er
-- nahm 14 Tage 23:59 Stunden als Obergrenze — das gilt nur, wenn zwischen
-- Start und Ende keine Zeitumstellung liegt. Liegt die HERBSTumstellung darin,
-- hat einer der Tage 25 Stunden. Am 06.08.2026 an der Produktionsdatenbank
-- gemessen:
--
--   18.10.2026 00:00 (CEST)  ->  01.11.2026 23:59 (CET)  =  15 Tage 00:59
--
-- `interval '15 days'` haette diese Jagd also ABGELEHNT, obwohl das Formular
-- sie erlaubt: die Ausnahme waere ausgefallen und die Jagd nachts eingesammelt
-- worden — genau der Widerspruch, den diese Migration beheben soll, nur eine
-- Stunde weiter hinten. Gefunden von der Fremdpruefung als `[high]`, **bevor
-- die Migration appliziert wurde**; das ist der Zweck von Anker 2.
--
-- **16 statt `15 days 1 hour`**: eine ganze Zahl mit einer Stunde Luft. Ein
-- krummer Wert deckte den gemessenen Fall exakt und ohne Rand ab — dieselbe
-- Bauform wie ein Riegel, der den Angriff enthaelt, gegen den er gebaut ist
-- (Lehre (1) vom 04.08.2026).
--
-- **Der Deckel bleibt ein Deckel.** Er wurde nie als Produktgrenze gebaut,
-- sondern als Riegel gegen ein vertipptes Jahr und gegen eine Jagd, die sich
-- per `scheduled_until = 2099` dauerhaft am Leben haelt. Ein Tag mehr Rand
-- kostet dort nichts; die Produktgrenze („hoechstens 14 Tage") steht im
-- Formular.
--
-- **Dritte Wiederholung derselben Falle in diesem Projekt:** am 03.08. lag
-- eine Grenzwert-Zusicherung neben der Grenze, am 04.08. eine Zahl neben der
-- Grenze, hier eine Zeitspanne, die den Umstellungstag nicht mitrechnet. Wer
-- in diesem Repo einen Zeitraum deckelt, rechnet die Umstellung durch, BEVOR
-- er eine Zahl hinschreibt.
--
-- ===========================================================================
-- Beide Deckel wandern mit — auch der absolute
-- ===========================================================================
--
-- Der RELATIVE allein traegt nicht, und das ist der Befund der Schlusslesung
-- vom 04.08.2026: er misst gegen `scheduled_for`, eine Spalte, die derselbe
-- Schreiber kontrolliert. Wer beide auf 2099 setzt, haelt die Spanne klein und
-- die Ausnahme auf Dauer. Der ABSOLUTE Deckel ist gegen nichts zu stellen, was
-- der Client schreiben kann.
--
-- Bliebe er bei 14 Tagen, waere er ab sofort der striktere von beiden und
-- schnitte genau die Jagd wieder weg, fuer die diese Migration existiert.
--
-- ===========================================================================
-- Was diese Migration bewusst NICHT tut
-- ===========================================================================
--
--   * **Keine Aenderung an Bedingung, Reihenfolge oder Zeitpunktvergleich des
--     Jobs.** Nur die zwei Intervalle. Der Rumpf wird aus 102 uebernommen und
--     hier vollstaendig wiederholt, weil `cron.alter_job` ihn als Ganzes
--     setzt — ein Patch waere nicht ausdrueckbar.
--   * **Kein `cron.schedule`.** pg_cron loest den Konflikt ueber
--     `(jobname, username)` aus `current_user`; unter anderer Rolle entstuende
--     ein ZWEITER Job, waehrend der alte weiter Jagden beendet — die Migration
--     haette Erfolg gemeldet und nichts bewirkt (Befund `[high]` vom
--     04.08.2026). `into strict` wirft bei 0 oder >1 Treffern.
--   * **Keine Beruehrung des Schwesterjobs** `activate-scheduled-hunts`.
--   * **Kein CHECK auf die Dauer.** Die Grenze gehoert ins Formular, wo sie
--     sich erklaeren laesst (095), und in den Cron, wo sie einen Schaden
--     begrenzt. Eine dritte Stelle waere eine dritte Wahrheit.

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
        ended_at = last_activity_at
    WHERE ended_at IS NULL
      AND status <> 'scheduled'
      AND last_activity_at < now() - interval '12 hours'
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
end $$;

-- ---------------------------------------------------------------------------
-- Gegenproben (NACH dem Applizieren; die schreibenden mit ROLLBACK)
-- ---------------------------------------------------------------------------
--
--   -- 1 Der Job existiert GENAU EINMAL, gehoert `postgres`, ist aktiv und
--        traegt den neuen Rumpf:
--          select jobid, username, active, schedule,
--                 command like '%16 days%'  as neuer_deckel,
--                 command like '%14 days%'  as alter_deckel_weg
--            from cron.job where jobname = 'auto-end-stale-hunts';
--        -- erwartet: EINE Zeile, jobid 4, postgres, true, true, FALSE
--   -- 2 Schwesterjob `activate-scheduled-hunts`: Hash vorher wie nachher.
--   -- 3 Wahrheitstabelle ueber VALUES, ohne die Produktionstabelle:
--        a) ohne scheduled_until, 13 h still                  -> beendet
--        b) Start 07:00, Ende +14 Tage 20:00 (14 d 13 h)      -> BLEIBT
--           **die Zeile, fuer die es diese Migration gibt**
--        c) Start 00:00, Ende +14 Tage 23:59 (14 d 23:59 h)   -> BLEIBT
--           (der schlechteste Fall OHNE Zeitumstellung dazwischen)
--        d) Start 18.10. 00:00 CEST, Ende 01.11. 23:59 CET    -> BLEIBT
--           **15 Tage 00:59 — der Fall, an dem `15 days` gescheitert waere.**
--           Ohne diese Zeile belegt die Tabelle die Zahl 16 gar nicht.
--        e) Start 00:00, Ende +16 Tage 00:01                  -> beendet
--           (eine Minute jenseits des Deckels)
--        f) scheduled_until 2099 (Vertipper/Angriff)          -> beendet
--        g) scheduled_until gestern                           -> beendet
--        h) scheduled_until gesetzt, scheduled_for NULL       -> beendet
--   -- 4 Mutantenproben, ZWEI: mit `14 days` muss (b) kippen, mit `15 days`
--        muss (d) kippen. Sonst belegt die Wahrheitstabelle nur, dass die
--        Abschrift zu sich selbst passt — und die zweite ist die, die den
--        Befund vom 06.08.2026 festhaelt.
--   -- 5 Bestand: Zahl der Jagden und der faelligen Zeilen vorher wie nachher.
--   -- 6 Regression 107: `trg_hunts_endtermin` ist unberuehrt, der Trigger
--        feuert weiter (eine geplante Jagd ohne Ende bekommt ihr Tagesende).
