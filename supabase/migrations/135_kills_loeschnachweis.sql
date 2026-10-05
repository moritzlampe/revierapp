-- 135: Erlegung loeschen — Loeschsperre bei gesicherter Jagd und
--      Loesch-Nachweis gegen das Neu-Schreiben (CN-292).
--
-- ANLASS: CN-292 erlaubt dem Melder, seine eigene Erlegung zu loeschen
-- (Falschmeldung: "erlegt gemeldet, aber dann doch nicht gefunden").
-- Das DELETE selbst erlaubt der Server seit 003 (`kills_reporter`, for all).
-- Die F14-Pruefung des Bauplans fand zwei Stellen, die nur der Server
-- schliessen kann (Moritz, 05.10.2026: Variante b):
--   1. Zweites Geraet desselben Kontos: A haelt eine Meldung im Postausgang
--      (Schritt 1, Antwort verloren), B loescht die Erlegung, A sieht
--      "nicht vorhanden" und schreibt dieselbe Kennung NEU
--      (quickhunt-native `melde-outbox.ts:832`). Codex: hoch.
--   2. Eine Erlegung einer GESICHERTEN Jagd war loeschbar — die Sperre aus
--      133 haengt nur an `hunts` und `hunt_participants`.
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Erlegung_Loeschen_V1.md §9/§10
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/135_kills_loeschnachweis.md
--
--
-- DIE REGEL IN DREI SAETZEN
--
-- 1. Wer eine Erlegung loescht, hinterlaesst ihre Kennung in
--    `kills_geloescht`. Eine Erlegung mit dieser Kennung kann nie wieder
--    angelegt werden: der INSERT scheitert mit `42501`.
-- 2. Eine Erlegung einer gesicherten Jagd (`hunts.gesichert_am`) loescht
--    ein Client nicht: `55006`, wie bei Jagd und Teilnehmer (133).
-- 3. Server-Wege (`konto_loeschen`, Owner `postgres`) sind von der Sperre
--    ausgenommen — dieselbe `current_user`-Weiche wie 133. Den Nachweis
--    hinterlassen auch sie.
--
--
-- WARUM `42501` UND KEIN EIGENER CODE
--
-- Der Postausgang haelt nur die SQLSTATE-Klassen 22, 23 und 42 fuer
-- endgueltig (`check-outbox.ts:329`, `istHeilbar`). Jeder andere Code
-- (`55006`, `P0001`) gilt als heilbar — die abgewiesene Meldung wuerde
-- FUER IMMER wiederholt. `23505` waere schlimmer: der Postausgang liest es
-- als "stand schon" (`melde-outbox.ts:312`) und schickte danach Chatzeile
-- und Foto zu einer geloeschten Erlegung. `42501` endet als `abgelehnt`,
-- der Jaeger sieht die Meldung als Merkzettel mit dem Grund.
--
--
-- WAS DIESE MIGRATION BEWUSST NICHT TUT
--
--   * Keine Sperre fuer Erlegungen mit Wildmarke — der Client filtert sie
--     IM DELETE (`.is('wildmarke_nr', null)`), und das ist atomar. Heute
--     schreibt nur die PWA das Feld (0 Zeilen, gemessen 05.10.2026).
--   * Keine Frist, kein Status-Tor: laufende Jagd und `wounded` bleiben
--     loeschbar — genau dort tritt der Fall auf (Bauplan E1).
--   * Kein Aufraeumen von `kills_geloescht`. Eine Zeile je Loeschung, nur
--     Kennung und Zeitpunkt. Ein Postausgang kann Tage offline sein; eine
--     Frist muesste laenger sein als jede denkbare Wartezeit.
--   * Kein Fremdschluessel aus `kills_geloescht` — weder auf `kills` (die
--     Zeile ist ja weg) noch auf ein Konto (AGENTS.md, Kontoloeschung 132).
--   * `hunt_photos` mit toter Kill-ID werden NICHT verhindert (Foto-Upload
--     einer offenen Stueck-Seite nach dem Loeschen) — der Client oeffnet das
--     Entfernen dafuer (Bauplan §9.2/4, /7).
--
--
-- BEKANNTE FOLGEN DER SPERRE (fail-closed, gemessen 05.10.2026)
--
--   * Die Sperre liest die Jagd unter RLS (`hunts_participant_select` ueber
--     `get_my_hunt_ids()`: jede Teilnahme ohne `entfernt_am`, also auch
--     `invited` und `left`). Wer aus der Jagd ENTFERNT wurde, sieht sie
--     nicht mehr und bekommt beim Loeschen seiner Erlegung `42501` — er
--     sieht dann auch ihre Strecke nicht.
--   * `kills.hunt_id` ist nullable; eine Erlegung OHNE Jagd waere fuer
--     Clients unloeschbar (`42501`, "Jagd nicht sichtbar"). Bestand: 0.
--   * Alle 6 Erlegungen haben heute einen Melder mit Status `joined`.
--
--
-- REIHENFOLGE DER TRIGGER AUF `kills` (feuern alphabetisch, 096)
--
--   BEFORE INSERT: `trg_kills_a_nicht_geloescht` (NEU) feuert vor
--   `trg_kills_herkunft`, `_katalog`, `_set_drive_id`, `_trichinen`,
--   `_wild_event_id` — damit eine geloeschte Kennung mit IHREM Grund
--   abgewiesen wird und nicht mit dem eines Herkunfts-Triggers.
--   BEFORE DELETE: `trg_kills_gesichert_loeschsperre` (NEU) ist der einzige.
--   AFTER DELETE: `trg_kills_loeschnachweis` (NEU) neben
--   `trg_kills_sync_wild_event` — Reihenfolge ohne Belang.
--
-- `pg_temp` am ENDE jedes search_path (076). REVOKE namentlich (081/082).
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 135_kills_loeschnachweis.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build applizieren: der Client wertet `55006` beim
-- Loeschen aus.

begin;

-- ---------------------------------------------------------------------------
-- 1. Loesch-Nachweis
-- ---------------------------------------------------------------------------

create table public.kills_geloescht (
  kill_id      uuid primary key,
  geloescht_am timestamptz not null default now()
);

comment on table public.kills_geloescht is
  'Kennungen geloeschter Erlegungen (135, CN-292). Eine Kennung hier kann '
  'nie wieder als kills.id angelegt werden. Nur Trigger schreiben und lesen.';

-- Kein Client liest oder schreibt hier. RLS an und keine Policy, dazu die
-- Tabellenrechte entzogen, die Supabase per Default vergibt.
alter table public.kills_geloescht enable row level security;
revoke all on table public.kills_geloescht from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Nachweis schreiben (AFTER DELETE)
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER: der Loeschende hat auf `kills_geloescht` kein Recht.

create function public.kill_loeschnachweis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.kills_geloescht (kill_id)
  values (old.id)
  on conflict (kill_id) do nothing;
  return old;
end;
$$;

create trigger trg_kills_loeschnachweis
  after delete on public.kills
  for each row execute function public.kill_loeschnachweis();

-- ---------------------------------------------------------------------------
-- 3. Geloeschte Kennung abweisen (BEFORE INSERT)
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER: der Schreibende darf `kills_geloescht` nicht lesen.
-- Keine `current_user`-Weiche — auch ein Server-Weg soll eine geloeschte
-- Kennung nicht wiederbeleben.

create function public.kill_nicht_geloescht()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.kills_geloescht g where g.kill_id = new.id) then
    raise exception 'Diese Erlegung wurde geloescht und wird nicht neu angelegt'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_kills_a_nicht_geloescht
  before insert on public.kills
  for each row execute function public.kill_nicht_geloescht();

-- ---------------------------------------------------------------------------
-- 4. Loeschsperre bei gesicherter Jagd (BEFORE DELETE)
-- ---------------------------------------------------------------------------
--
-- Dieselbe Funktion wie fuer `hunt_participants` (133): sie liest
-- `hunts.gesichert_am` ueber `old.hunt_id` unter RLS, ist fail-closed
-- (`42501`, wenn der Loeschende die Jagd nicht sieht) und laesst
-- Server-Wege an der `current_user`-Weiche durch. INVOKER — sie MUSS
-- `current_user` lesen koennen; ihre Rechte bleiben wie in 133.

create trigger trg_kills_gesichert_loeschsperre
  before delete on public.kills
  for each row execute function public.gesicherte_jagd_nicht_loeschen();

-- ---------------------------------------------------------------------------
-- 5. Rechte
-- ---------------------------------------------------------------------------
--
-- Trigger-Funktionen: niemand ruft sie direkt; Postgres prueft EXECUTE beim
-- ANLEGEN des Triggers, nicht beim Feuern (082, gemessen 31.07.2026).

revoke execute on function public.kill_loeschnachweis()
  from public, anon, authenticated, service_role;
revoke execute on function public.kill_nicht_geloescht()
  from public, anon, authenticated, service_role;

commit;
