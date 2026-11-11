-- 151: Live-Punkt nur ueberschreiben, wenn neuer (CN-469).
--
-- Bauplan (F14, Codex + Schlusslesung je zwei Runden, FREIGEGEBEN 11.11.2026,
-- Fassung 3):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Live_Punkt_nur_neuer_V1.md
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/151_live_punkt_nur_neuer.md
--
-- ANLASS
--
-- Am 07.11.2026 schrieb ein Geraet einen aelteren Fix ueber einen neueren;
-- der Punkt stand danach stundenlang rund 100 m neben dem Stand. Die App
-- haelt das seit CN-467 fuer EIN Geraet im Speicher ab. Was sie nicht sehen
-- kann, schliesst nur der Server: eine abgebrochene Anfrage, die spaet
-- committet; Android-Jobs nach einem Prozess-Kill; ein Zweitgeraet; die PWA;
-- alte Builds.
--
-- WAS SICH AENDERT
--
-- BEFORE-UPDATE-Trigger auf `positions_current`: Ist `updated_at` des
-- Schreibers aelter als der gespeicherte, gibt er die ALTE Zeile zurueck.
-- Die Zeile bleibt unveraendert, das UPDATE zaehlt trotzdem (PostgREST
-- `200`, `count 1`). Deshalb braucht kein Client eine Aenderung: jede App
-- ab Build 63 wertet das als erledigt.
--
-- Gleich alt geht durch (150, Anweisung 2, laesst `updated_at` stehen).
-- NULL auf einer Seite geht durch.
-- Liegt der Bestand in der Zukunft, gilt der Riegel nicht (eine falsch
-- gehende Uhr friert sonst den Punkt ein). Verglichen wird mit
-- `clock_timestamp()`, nicht `now()`: `now()` ist der Transaktionsbeginn, und
-- ein Upsert, der auf eine Zeilensperre gewartet hat, hielte einen inzwischen
-- vergangenen Bestand noch fuer Zukunft (Codex D3, lokal gemessen).
--
-- FALLEN
--
-- * Ein verworfener Fix feuert die AFTER-Trigger (Aktivitaet, gedrosselt) und
--   ein Realtime-UPDATE mit unveraenderter Zeile. Kein Leser deutet die
--   Ankunft eines Ereignisses.
-- * Jedes UPDATE, das `updated_at` zuruecksetzt, meldet `UPDATE 1` und
--   aendert NICHTS, auch keine andere Spalte, auch als `postgres` -- es sei
--   denn, der Bestand liegt in der Zukunft (dann greift der Zukunftsschutz,
--   Codex P5). Wer fuer eine Probe zurueckdatiert, nimmt DELETE + INSERT.
-- * Die Reihenfolge zu `trg_positions_current_ungenau_leeren` (150) ist
--   wirkungslos: Gibt dieser Trigger OLD zurueck, leert der andere nicht.
-- * Der Riegel ordnet nach den Uhren der Geraete. Schreiben zwei Geraete
--   desselben Teilnehmers und geht eine Uhr falsch, gewinnt der spaetere
--   Stempel, nicht die spaetere Messung (Bauplan E4, hingenommen).
-- * Applizieren nur bei 0 Jagden `active`/`paused` (Vorpruefung als
--   Abbruch, nicht in dieser Datei): das Anlegen sperrt Schreiber kurz, und
--   die Nachzuege aus 149/150 brechen nach 500 ms ab.

begin;

set local lock_timeout = '5s';

create or replace function public.live_punkt_nur_neuer()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.updated_at < old.updated_at
     and old.updated_at <= clock_timestamp() then
    return old;
  end if;
  return new;
end;
$function$;

comment on function public.live_punkt_nur_neuer() is
  '151 (CN-469): laesst positions_current stehen, wenn ein Schreiber einen aelteren Stempel bringt (gibt OLD zurueck). Bestand in der Zukunft bindet nicht. Nur als Trigger.';

revoke all on function public.live_punkt_nur_neuer()
  from public, anon, authenticated, service_role;

create or replace trigger trg_positions_current_aelter_verwerfen
  before update on public.positions_current
  for each row
  execute function public.live_punkt_nur_neuer();

commit;
