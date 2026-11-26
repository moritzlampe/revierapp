-- 168: Absender im Chat binden (SR-01) und Live-Punkt beim Austritt raeumen (CN-610).
-- Quelle: Security-Review 26.11.2026 (Befund 1 und 2), Freigabe Moritz 26.11.2026 („ja vorher noch").
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/168_chat_absender_austritt.md
-- Vorarbeit: quickhunt-native/docs/migrationen/120_chat_foto_loeschen.md („Was eine tragfaehige Fassung braucht").
--
-- ANLASS
--   `messages` hat zwei Schreibwege, und RLS verknuepft die INSERT-Policies mit ODER:
--   * Gruppenweg `messages_insert_group` (App, PWA-Gruppen- und Direktchats; alle Bestandszeilen):
--     prueft Gruppe und `sender_id`, laesst aber `hunt_id` und `participant_id` offen. Damit landet eine
--     Nachricht im PWA-Jagd-Tab einer FREMDEN Jagd (`messages_hunt_member` liest ueber `hunt_id`), angezeigt
--     unter der `participant_id` eines anderen (`ChatPanel.tsx` `getSenderId`).
--   * Jagdweg `messages_insert_member` (nur PWA-Jagd-Tab, schreibt `hunt_id` + `participant_id`, `sender_id`
--     NULL): prueft nur die `hunt_id`. Wer irgendwo beigetreten ist, schreibt damit mit beliebiger
--     `sender_id`/`participant_id` in JEDEN Chat, dessen `group_id` er kennt -- auch Direktchats.
--   `jagd_verlassen` setzt nur `status = 'left'`; die Live-Zeile bleibt, und der Fremd-Zweig von
--   `live_sichtbare_teilnahmen` (166) fragt den Status nicht ab: der letzte Standort eines Ausgetretenen
--   bleibt fuer Leitung und Sicht „alles" bis zum Jagdende sichtbar.
--
-- INHALT
--   1. Beide INSERT-Policies schliessen einander aus, jede bindet ihre Identitaetsachse an den Aufrufer:
--      Gruppenweg: `sender_id = auth.uid()`, `hunt_id` und `participant_id` leer.
--      Jagdweg:    `group_id` und `sender_id` leer (so schreibt die PWA), `participant_id` = die EIGENE
--                  Teilnahme an GENAU dieser Jagd; die bisherige Jagd-Bedingung bleibt wortgleich.
--      Beide `to authenticated` (Policy ruft eine Funktion -- AGENTS.md, „Ruft eine Policy eine Funktion").
--   2. `jagd_verlassen` loescht danach die eigene Live-Zeile dieser Jagd (wie `teilnehmer_entfernen`).
--   3. `live_sichtbare_teilnahmen`: der Fremd-Zweig verlangt `hp.status = 'joined'` (wie der Stern-Zweig).
--      Das deckt jeden Weg aus der Jagd, auch eine Statusaenderung durch die Leitung und einen Live-Punkt,
--      den ein Rennen nach dem Loeschen in 2. neu schreibt.
--
-- NICHT HIER: Stand-Bezug eines Aussteigers (CP-103), Sitz-Einteilung, Chat-Mitgliedschaft nach dem
-- Austritt (CN-613), Pirschweg nach dem Austritt, SR-05.
--
-- VERTRAEGLICHKEIT: kein ehrlicher Schreiber verliert etwas -- App und PWA schreiben genau die erlaubten
-- Formen (gelesen: quickhunt-native `src/lib/data/chat.ts`, revierapp `src/components/hunt/ChatPanel.tsx`).
-- Bestand: alle Nachrichten tragen `group_id` und `sender_id`, keine `hunt_id`/`participant_id`.
-- SPERRE: ALTER POLICY nimmt ACCESS EXCLUSIVE auf `messages` bis zum Commit -- Apply mit `lock_timeout`.

begin;

alter policy messages_insert_group on public.messages
  to authenticated
  with check (
        group_id in (select public.get_my_group_ids())
    and sender_id = auth.uid()
    and hunt_id is null
    and participant_id is null
  );

alter policy messages_insert_member on public.messages
  to authenticated
  with check (
        group_id is null
    and sender_id is null
    and participant_id in (select hp.id
                             from public.hunt_participants hp
                            where hp.hunt_id = messages.hunt_id
                              and hp.user_id = auth.uid())
    and (   hunt_id in (select public.get_my_joined_hunt_ids_as_leader())
         or hunt_id in (select h.id
                          from public.hunts h
                         where h.id in (select public.get_my_joined_hunt_ids())
                           and (   h.chat_open = true
                                or now() >= h.scheduled_for
                                or h.scheduled_for is null)))
  );

create or replace function public.jagd_verlassen(p_hunt uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  betroffen int;
begin
  update hunt_participants
     set status  = 'left',
         left_at = now()
   where hunt_id = p_hunt
     and user_id = auth.uid()
     -- IS DISTINCT FROM: status ist nullable, `null <> 'left'` wäre null.
     and status is distinct from 'left';

  get diagnostics betroffen = row_count;

  if betroffen = 0 then
    raise exception 'Keine offene Teilnahme an dieser Jagd gefunden';
  end if;

  -- 168 (CN-610): der letzte Standort geht mit, wie bei `teilnehmer_entfernen`.
  -- Schreibt ein Geraet im selben Augenblick noch einen Punkt, kann er danach
  -- wieder stehen -- `live_sichtbare_teilnahmen` zeigt ihn dann nur noch dem
  -- Ausgetretenen selbst (Zweig 2 verlangt `joined`).
  delete from positions_current
   where participant_id in (select hp.id from hunt_participants hp
                             where hp.hunt_id = p_hunt
                               and hp.user_id = auth.uid());
end;
$function$;

create or replace function public.live_sichtbare_teilnahmen()
returns setof uuid
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select hp.id
    from hunt_participants hp
   where hp.user_id = auth.uid()
  union
  select hp.id
    from hunt_participants hp
    join hunts h on h.id = hp.hunt_id
   where hp.hunt_id in (select m.hunt_id from hunt_participants m
                         where m.user_id = auth.uid() and m.status = 'joined')
     and hp.status = 'joined'                 -- 168 (CN-610): Ausgetretene nicht
     and hp.position_consent is distinct from 'none'
     and hp.ortung_pausiert_seit is null      -- 164 (E9, Codex DB-8)
     and h.status in ('active', 'paused')
     and public.teilnahme_in_sicht(hp.id)
  union
  -- 166 (CN-577, E9): Stern -- der Geber zeigt mir seinen Punkt auf jeder
  -- gemeinsamen Jagd, unabhaengig von der Sicht der Jagd.
  select hp.id
    from standort_freigaben f
    join hunt_participants hp on hp.user_id = f.geber_id
    join hunts h on h.id = hp.hunt_id
   where f.empfaenger_id = auth.uid()
     and f.aktiv
     and hp.hunt_id in (select m.hunt_id from hunt_participants m
                         where m.user_id = auth.uid() and m.status = 'joined')
     and hp.status = 'joined'
     and hp.position_consent is distinct from 'none'
     and hp.ortung_pausiert_seit is null
     and h.status in ('active', 'paused')
$function$;

commit;
