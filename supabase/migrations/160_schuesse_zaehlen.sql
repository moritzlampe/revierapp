-- 160: Schuesse zaehlen (CN-522).
--
-- ANLASS: Feedback #38 (15.11.2026) -- beim Melden soll der Schuetze angeben,
-- wie viele Schuesse er abgegeben hat; ein Fehlschuss soll sich melden lassen.
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Schuesse_zaehlen_V1.md
-- (V3, GELOCKT 17.11.2026, Moritz: "cn 522 freigegeben"). Abschnitte E1-E6, O1.
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/160_schuesse_zaehlen.md
--
--
-- DIE REGELN (Moritz, 16.11.2026, woertlich bestaetigt)
--
-- * Die Zahl gilt je Stueck; alte Stuecke bleiben "ohne Angabe", nicht 1.
-- * Nach der Kontrolle aenderbar wie Gewicht und Entfernung
--   ("ja oft wird im nachgang gewogen und vorher geschaetzt").
-- * Fehlschuss auf eine Wildart = Anblick mit Schuessen; Schuss ohne Wildart
--   moeglich ("schuss auf schwarzwild vorbei koennte dann ja mit unter anblick
--   fallen ?").
-- * Sicht: Schusszahl einer Erlegung sieht jeder, der das Stueck sieht;
--   Schuss ohne Wildart nur der Melder und die Leitung; beschossener Anblick
--   so sichtbar wie jeder Anblick.
-- * O1: ein Fehlschuss haelt die Jagd am Leben wie ein Anblick
--   ("ja zaehlt doch wie anblick").
--
--
-- WAS SICH AENDERT
--
-- 1. `kills.schuesse smallint NULL`, CHECK 0..99 (E1). NULL = ohne Angabe,
--    0 = der Hund hat gerissen. Alle Insert-Wege tragen Spaltenlisten, alte
--    Builds und der Postausgang alter Eintraege schicken die Spalte nicht.
-- 2. `wild_events.schuesse smallint NULL`, CHECK 1..99 (E3/E4). Bei
--    `sighting` heisst NULL "nicht geschossen" (der Client schreibt 0 als
--    NULL). `count` bleibt "Anzahl Tiere" -- keine Umdeutung (Falle 1 aus 125).
--    Zusatz-CHECK: eine Zeile `type = 'miss'` traegt immer eine Schusszahl.
-- 3. Neue SELECT-Policy `wild_events_miss_leitung` (E4): die Leitung der Jagd
--    (`kontroll_stufe = 'leitung'`, Ersteller oder joined Jagdleiter, 156)
--    sieht Schuesse ohne Wildart. `kontroll_stufe` hat kein EXECUTE fuer
--    `anon` -- deshalb `to authenticated` (AGENTS.md: ruft eine Policy eine
--    Funktion, braucht sie `to authenticated`).
-- 4. `pruefe_wild_event_zuordnung` R3 (E5): prueft `sighting` UND `miss`.
--    Der Kill-Spiegel schreibt nur `kill` und bleibt samt `invited`-Ausnahme
--    (090) unberuehrt. Ohne diese Zeile koennte jeder mit einer bekannten
--    `hunt_id` einen Fehlschuss in eine fremde Jagd schreiben -- und die
--    Leitung jener Jagd saehe ihn (Policy 3).
-- 5. `kill_kontrolle_schutz` (152, E6): `schuesse` auf die Erlaubnisliste nach
--    der Kontrolle. Die Liste steht ZWEIMAL (new und old) -- beide ergaenzt.
--    Wer aendern darf, bestimmt weiter die Policy (`kills_reporter`).
-- 6. `trg_wild_events_activity` (134, O1): `WHEN (new.type in ('sighting',
--    'miss'))`. Erst zusammen mit 4 -- das WHEN aus 134 schuetzt davor, dass
--    jemand mit einer bekannten `hunt_id` eine fremde Jagd am Leben haelt; R3
--    schliesst das fuer `miss` jetzt genauso wie fuer `sighting`.
--
--
-- WAS BLEIBT
--
-- * `wild_events_owner_all` (Eigentuemer liest und schreibt alles) und
--   `wild_events_hunt_member` (nur `sighting`, mit `anblick_in_sicht`) --
--   unveraendert. Ein beschossener Anblick ist eine `sighting`-Zeile und folgt
--   damit der Anblick-Sicht.
-- * `set_wild_event_katalog` kehrt bei `wildart_id is null` zurueck (gemessen
--   16.11.2026); `wild_events_count_check` laesst `count` NULL durch.
-- * R2 (Typ fest bei UPDATE) unveraendert.
-- * `kill_verlauf_schreiben` / `kill_stand` unveraendert -- die Schusszahl
--   erscheint nicht im Verlauf (CN-506 prueft das beim Bau).
-- * Treiben-Zuordnung von Fehlschuessen: keine Spalte (E9, CN-520 ordnet
--   ueber `occurred_at` zu).
--
--
-- BESTAND (gemessen 17.11.2026): `wild_events` kill 12, sighting 9, miss 0;
-- `kills` 12. Keine Zeile verletzt die neuen CHECKs (alle neu NULL; keine
-- `miss`-Zeile).
--
--
-- FALLEN
--
-- * Funktionen aus `pg_get_functiondef` (17.11.2026) uebernommen, nicht aus
--   den Dateien 152/090 (076-Loch). `create or replace` behaelt Eigentuemer
--   und ACL: beide Trigger-Funktionen haben kein EXECUTE fuer
--   `anon`/`authenticated` (082), das bleibt so. Den `search_path` behaelt es
--   NICHT -- er gilt nur, weil er in jeder Funktion ausdruecklich als
--   `SET search_path TO 'public', 'pg_temp'` steht. Nie weglassen.
-- * BEFORE-Trigger auf `wild_events` feuern alphabetisch: `katalog` vor
--   `zuordnung` (122). Unveraendert -- 160 legt keinen BEFORE-Trigger neu an.
-- * Die DDL sperrt `kills` und `wild_events` bis zum Commit (ACCESS
--   EXCLUSIVE fuer ADD COLUMN/ADD CONSTRAINT/DROP/CREATE TRIGGER). Nicht
--   waehrend einer laufenden Jagd; mit `lock_timeout` aufrufen (134):
--     psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--          -c "set statement_timeout = '120s'" -f 160_schuesse_zaehlen.sql
--   Dasselbe gilt fuer jeden Probelauf mit ROLLBACK (Bauplan Schlusslesung B11).
-- * Reihenfolge (E10): diese Migration VOR dem ersten Client, der `schuesse`
--   schickt -- auch vor dem ersten Lauf im Metro. Sonst PGRST204 an jeder
--   Erlegung (Falle 125).
-- * Kein neuer Fremdschluessel (154/PGRST201 nicht beruehrt).

begin;

-- 1. Schusszahl am Stueck (E1)
alter table public.kills
  add column schuesse smallint,
  add constraint kills_schuesse_bereich check (schuesse between 0 and 99);

comment on column public.kills.schuesse is
  '160 (CN-522): eigene Schuesse des Schuetzen auf dieses Stueck. NULL = ohne Angabe (Altbestand, alte Builds), 0 = ohne Schuss (Hund). Nach der Kontrolle aenderbar (kill_kontrolle_schutz).';

-- 2. Schusszahl am Wildereignis (E3/E4)
alter table public.wild_events
  add column schuesse smallint,
  add constraint wild_events_schuesse_bereich check (schuesse between 1 and 99),
  add constraint wild_events_miss_hat_schuesse check (type <> 'miss' or schuesse is not null);

comment on column public.wild_events.schuesse is
  '160 (CN-522): sighting = beschossener Anblick ("vorbei"), NULL = nicht geschossen; miss = Schuss ohne Wildart, Pflicht. count bleibt Anzahl Tiere.';

-- 3. Schuss ohne Wildart: Leitung liest mit (E4)
create policy wild_events_miss_leitung on public.wild_events
  for select to authenticated
  using (type = 'miss' and public.kontroll_stufe(hunt_id) = 'leitung');

-- 4. Zuordnungspruefung R3 fuer sighting UND miss (E5)
CREATE OR REPLACE FUNCTION public.pruefe_wild_event_zuordnung()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- R2: `type` steht mit der Zeile fest. Ohne diesen Satz ist die
  -- `type = 'sighting'`-Bedingung der Policy wertlos — der Eigentümer könnte
  -- seine Kill-Spiegelzeile umtypisieren und an der Streckensichtbarkeit
  -- vorbei freigeben.
  if tg_op = 'UPDATE' and new.type is distinct from old.type then
    raise exception 'Die Art eines Wildereignisses steht mit der Meldung fest'
      using errcode = 'insufficient_privilege';
  end if;

  -- R3: nur ANBLICKE und (seit 160, CN-522) SCHUESSE OHNE WILDART werden hier
  -- geprüft, weil der Spiegel jede Erlegung als SECURITY DEFINER hereinschreibt
  -- — eine Prüfung für alle Typen träfe ihn und nicht den Angreifer.
  -- Zusätzlich lässt 090 für Erlegungen `invited` genügen, diese Prüfung
  -- verlangt `joined`.
  -- ⛔ Die Prüfung haengt am TYP, nicht an der Herkunft. Ein Client kann sehr
  -- wohl direkt eine Zeile mit `type='kill'` und beliebiger `hunt_id`
  -- anlegen; folgenlos, SOLANGE keine Policy einem Fremden einen Typ ausser
  -- `sighting`/`miss` zeigt. 160 öffnet `miss` für die Leitung
  -- (`wild_events_miss_leitung`) und nimmt `miss` deshalb HIER auf. Wer je
  -- einen weiteren Typ freigibt, nimmt ihn in diese Liste auf. Bekannte
  -- Restlücke: `jagd_hat_fremde_daten` liest jeden Typ (CN-532).
  if new.type not in ('sighting', 'miss') or new.hunt_id is null then
    return new;
  end if;

  -- Unveränderte Zuordnung nicht erneut prüfen: sonst schlüge ein späteres
  -- UPDATE fehl, nur weil der Melder die Jagd inzwischen verlassen hat.
  if tg_op = 'UPDATE' and new.hunt_id is not distinct from old.hunt_id then
    return new;
  end if;

  if not exists (
    select 1 from public.hunt_participants p
     where p.hunt_id = new.hunt_id
       and p.user_id = new.user_id
       and p.status = 'joined'
  ) and not exists (
    select 1 from public.hunts h
     where h.id = new.hunt_id
       and h.creator_id = new.user_id
  ) then
    raise exception 'Zu dieser Jagd gehoerst du nicht'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

-- 5. Schusszahl nach der Kontrolle aenderbar (E6)
CREATE OR REPLACE FUNCTION public.kill_kontrolle_schutz()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_erleger_uid uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.kontrolle is distinct from old.kontrolle
       or new.kontrolle_von is distinct from old.kontrolle_von
       or new.kontrolle_am is distinct from old.kontrolle_am
       or new.kontrolle_stufe is distinct from old.kontrolle_stufe then
      raise exception 'Den Kontrollzustand setzt nur die Kontrolle'
        using errcode = '42501';
    end if;

    -- 160 (CN-522): `schuesse` aenderbar wie Gewicht und Entfernung. Die Liste
    -- steht zweimal -- fehlt sie in einer Zeile, scheitert jedes UPDATE.
    if old.kontrolle is not null
       and (to_jsonb(new) - array['notiz', 'gewicht_kg', 'kapital', 'distance_m', 'schuesse', 'updated_at'])
           is distinct from
           (to_jsonb(old) - array['notiz', 'gewicht_kg', 'kapital', 'distance_m', 'schuesse', 'updated_at']) then
      raise exception 'Diese Erlegung ist kontrolliert -- aendern geht nur noch ueber die Kontrolle'
        using errcode = '42501';
    end if;

    return new;
  end if;

  -- DELETE
  if old.kontrolle is null then
    return old;
  end if;

  if old.participant_id is not null then
    -- Unter RLS des Melders. Fail-closed wie 133: sieht er die Teilnahme
    -- nicht, ist das keine Auskunft "Eigenmeldung".
    select p.user_id into v_erleger_uid
      from public.hunt_participants p
     where p.id = old.participant_id;
    if not found then
      raise exception 'Teilnahme nicht sichtbar' using errcode = '42501';
    end if;
  end if;

  if old.participant_id is null or v_erleger_uid is not distinct from old.reporter_id then
    raise exception 'Vom Jagdleiter kontrolliert -- loeschen geht nicht mehr'
      using errcode = 'P0001';
  end if;

  if old.kontrolle_stufe = 'leitung'
     and public.kontroll_stufe(old.hunt_id) is distinct from 'leitung' then
    raise exception 'Von der Jagdleitung bestaetigt -- loeschen kann nur die Jagdleitung'
      using errcode = 'P0001';
  end if;

  return old;
end;
$function$;

-- 6. Fehlschuss haelt die Jagd am Leben (O1, 134)
drop trigger trg_wild_events_activity on public.wild_events;
create trigger trg_wild_events_activity
  after insert on public.wild_events
  for each row
  when (new.type in ('sighting', 'miss'))
  execute function public.update_hunt_last_activity();

commit;
