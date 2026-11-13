-- 152: Jagdrollen Block B -- fuer andere eintragen und kontrollieren
--      (CN-327, CN-360, CN-295, Teil von CN-439).
--
-- Bauplan (F14, Codex + Schlusslesung je vier Runden, FREIGEGEBEN 12.11.2026,
-- Fassung 4.1), Paket P1:
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Jagdrollen_BlockB_V1.md
-- Begruendung, Pruefkette, Gegenproben:
-- quickhunt-native/docs/migrationen/152_jagdrollen_block_b.md
-- "E-B…" verweist auf die Entscheidungen im Bauplan (§3).
--
-- WAS SICH AENDERT
--
--  1. Annahme nur durch das Konto selbst (E-B2a): `joined`/`joined_at` an
--     einer fremden Konto-Zeile setzt kein Client mehr.
--  2. `kontroll_stufe(hunt)` -> 'leitung' | 'gruppenleiter' | null (E-B2).
--  3. `kills`: Kontrollzustand in vier Spalten (E-B5), Verlauf in
--     `kill_verlauf` (nur anhaengen, ein Schreibweg: AFTER-Trigger).
--  4. Fremdeintrag in `set_kill_herkunft` (E-B2, E-B3, E-B4): Ort und Treiben
--     setzt der Server, Zeit gedeckelt, kein Schein, nicht in Einzel- oder
--     gesicherter Jagd.
--  5. Sperren nach einer Kontrolle als Erlaubnisliste (E-B6), Loeschsperre
--     (`P0001`), Kontrollspalten nur ueber den Server.
--  6. RPC `erlegung_kontrollieren` mit Uebergangstabelle und
--     Compare-and-Swap (E-B6); RPC `gast_aufnehmen` (E-B14).
--  7. Sicht des Erlegers nach Annahme (`kills_erleger`, E-B8), Treiber-Regel
--     am Erleger (`meldung_in_sicht` DROP + CREATE), Foto- und Wildart-Sicht.
--  8. Fremdeintrag ohne Spiegel in `wild_events` (E-B9); ein Client setzt
--     `wild_event_id` nicht mehr von null auf einen Wert (123 Teil 3).
--  9. Aktivitaets-Trigger geteilt: eine Kontrolle schiebt das Auto-Ende nicht.
--
-- ERSETZTE FUNKTIONEN -- aus `pg_get_functiondef` vom 12.11.2026 (Live-
-- Katalog), nicht aus den Migrationsdateien (076-Loch, Bauplan §4 Bauregel).
-- `CREATE OR REPLACE` behaelt Eigentuemer und ACL; `proconfig` setzt die
-- SET-Klausel neu -- sie steht deshalb je Funktion wie live, ausser bei
-- `set_kill_herkunft` (+ `extensions`, E-B3).
--
-- ABWEICHUNGEN VOM BAUPLAN (bewusst, Begruendung in der .md):
--  a) Der Fremdeintrag sperrt die Jagdzeile `for no key update`, nicht
--     `for share`: der Aktivitaets-Trigger schreibt dieselbe Zeile im selben
--     INSERT, und zwei gleichzeitige Fremdeintraege mit `for share` liefen
--     beim Hochstufen in einen Deadlock (lokal gemessen).
--  b) Der Ort aus Stand und Sitz bindet das Kartenobjekt an das Revier DIESER
--     Jagd und an ihre Deckung (wie `staende_der_teilnahme`), weil `seat_id`
--     auf jedes Objekt zeigen darf (Kartei `hunt_seat_assignments`).
--  c) "Erleger = ich" steht in `erlegung_in_sicht`, nicht zusaetzlich in
--     `meldung_in_sicht` -- ihr einziger Aufrufer mit Erleger ist
--     `erlegung_in_sicht` und entscheidet vorher.
--  d) Keine Kontrolle in der Einzeljagd (Hint `einzeljagd`). Der Bauplan
--     schliesst die Einzeljagd fuer Fremdeintrag und Gast aus und schweigt zur
--     Kontrolle; ohne die Regel sperrte ein Revierbesitzer per API einen
--     Scheininhaber aus dessen eigenem Stueck aus (Schlusslesung B1, gemessen).
--
-- FALLEN
--
-- * BEFORE-Trigger feuern alphabetisch (096). Auf `kills`:
--   `trg_kills_a_*` < `_herkunft` < `_katalog` < `_kontrolle` < `_set_drive_id`
--   < `_trichinen` < `_updated` < `_wild_event_id`. `_set_drive_id` liest
--   `kontrolle`, das `_herkunft` setzt.
-- * Die Schutz-Trigger haengen an `current_user` (Bauform 133): Server-Wege
--   (RPCs, Sync, Backfill, konto_loeschen, RI) kommen durch. Wer die Weiche
--   aendert, bricht diese Wege.
-- * RLS prueft `kills_reporter` (`reporter_id = auth.uid()`) erst NACH den
--   BEFORE-Triggern. Was im Trigger an `new.reporter_id` haengt, ist bis
--   dahin eine Behauptung des Clients -- Rechte fragt der Trigger deshalb am
--   Aufrufer (`kontroll_stufe` mit `auth.uid()`), nie am Melder (lokal
--   gemessen 13.11.2026, s. .md).
-- * Sperrfolge Erlegung -> Treiben -> Jagd, wie die Client-Schreibwege und das
--   Loeschen eines Treibens (die Aktivitaet sperrt die Jagd zuletzt). Wer in
--   Fremdeintrag oder Kontrolle die Jagd zuerst sperrt, baut einen Deadlock
--   (Codex 13.11.2026 A11/B4, `rennen-a11b4.sh`).
-- * Applizieren nur bei 0 Jagden `active`/`paused` (Vorpruefung als Abbruch,
--   nicht in dieser Datei): `alter table kills` sperrt die Tabelle.
-- * `meldung_in_sicht` hat danach EINE Signatur mit vier Parametern; die
--   Aufrufer mit drei (`anblick_in_sicht`) laufen ueber den Default.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Annahme nur durch das Konto selbst (E-B2a)
-- ---------------------------------------------------------------------------
-- `participants_creator_all` hat kein WITH CHECK: der Ersteller konnte
-- `joined` an einer fremden Konto-Zeile setzen. Alles, was an "hat
-- angenommen" haengt (Sicht und Zaehlung des Erlegers), steht erst damit.
-- Zuruecksetzen (`invited`, `left`, `joined_at -> null`) bleibt frei.
-- Gaeste ohne Konto: frei (Portal, `gast_aufnehmen`).

create function public.teilnahme_annahme_nur_selbst()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.user_id is null or new.user_id = auth.uid() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'joined' or new.joined_at is not null then
      raise exception 'Eine Einladung nimmt nur das eingeladene Konto selbst an'
        using errcode = '42501';
    end if;
  elsif (new.status = 'joined' and old.status is distinct from 'joined')
     or (new.joined_at is not null and new.joined_at is distinct from old.joined_at) then
    raise exception 'Eine Einladung nimmt nur das eingeladene Konto selbst an'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- BEFORE INSERT feuert vor ON CONFLICT: ein Upsert umgeht ihn nicht.
create trigger trg_teilnehmer_annahme_nur_selbst
  before insert or update of status, joined_at on public.hunt_participants
  for each row execute function public.teilnahme_annahme_nur_selbst();

-- ---------------------------------------------------------------------------
-- 2. Wer darf fuer andere eintragen und kontrollieren (E-B2)
-- ---------------------------------------------------------------------------
-- NICHT `sicht_stufe`: die zaehlt `left` mit `joined_at` als Leitung -- ein
-- ausgetretener Jagdleiter koennte sonst weiter kontrollieren.
-- `joined` schliesst `entfernt_am` aus (`teilnehmer_entfernt_am_invariante`).

-- Immer am AUFRUFER (`auth.uid()`), auch im Fremdeintrag-Trigger (s. FALLEN).

create function public.kontroll_stufe(p_hunt uuid)
  returns text
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select case
           when auth.uid() is null then null
           when exists (select 1
                          from public.hunts h
                          left join public.districts d on d.id = h.district_id
                         where h.id = p_hunt
                           and (h.creator_id = auth.uid() or d.owner_id = auth.uid()))
             or exists (select 1
                          from public.hunt_participants p
                         where p.hunt_id = p_hunt
                           and p.user_id = auth.uid()
                           and p.status = 'joined'
                           and p.role = 'jagdleiter')
             then 'leitung'
           when exists (select 1
                          from public.hunt_participants p
                         where p.hunt_id = p_hunt
                           and p.user_id = auth.uid()
                           and p.status = 'joined'
                           and 'gruppenleiter' = any (p.tags))
             then 'gruppenleiter'
         end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Kontrollzustand an `kills` (E-B5)
-- ---------------------------------------------------------------------------
-- Schreiben: INSERT nur `set_kill_herkunft` (ueberschreibt, was der Client
-- schickt), UPDATE nur `erlegung_kontrollieren` -- `trg_kills_kontrolle`
-- weist jede Client-Aenderung ab.

alter table public.kills
  add column kontrolle text
    constraint kills_kontrolle_wert
      check (kontrolle in ('eingetragen', 'bestaetigt', 'korrigiert', 'doppelt', 'fehlmeldung')),
  add column kontrolle_von uuid
    constraint kills_kontrolle_von_fkey references public.profiles (id) on delete set null,
  add column kontrolle_am timestamptz,
  add column kontrolle_stufe text
    constraint kills_kontrolle_stufe_wert
      check (kontrolle_stufe in ('gruppenleiter', 'leitung')),
  add constraint kills_kontrolle_vollstaendig
    check ((kontrolle is null) = (kontrolle_am is null)
           and (kontrolle is null) = (kontrolle_stufe is null));

comment on column public.kills.kontrolle is
  '152: null = offen; eingetragen (Fremdeintrag), bestaetigt, korrigiert, doppelt, fehlmeldung. Nur der Server schreibt.';
comment on column public.kills.kontrolle_von is
  '152: wer zuletzt kontrolliert hat (beim Fremdeintrag der Melder). SET NULL greift nur, wenn eine profiles-Zeile wirklich faellt -- konto_loeschen loescht weich (132).';
comment on column public.kills.kontrolle_am is
  '152: Zeitpunkt des letzten Uebergangs. Aendert sich bei jedem Uebergang der RPC; der Aktivitaets-Trigger haengt daran (WHEN).';
comment on column public.kills.kontrolle_stufe is
  '152: gruppenleiter (Vorpruefung) | leitung (endgueltig, M-B11/M-B13).';

-- ---------------------------------------------------------------------------
-- 4. Verlauf je Stueck (E-B5, M-B4)
-- ---------------------------------------------------------------------------
-- Nur anhaengen. Schreiber ist allein `trg_kills_verlauf` (DEFINER); kein
-- Client hat INSERT/UPDATE/DELETE. Lesen: wer das Stueck sieht (die Policy
-- laeuft als Invoker gegen `kills` und erbt deren Policies).
-- Kein `hunt_id` (doppelt zu kills.hunt_id, ein Fremdschluessel weniger).

create table public.kill_verlauf (
  id         uuid primary key default gen_random_uuid(),
  kill_id    uuid not null references public.kills (id) on delete cascade,
  ereignis   text not null
    constraint kill_verlauf_ereignis_wert
      check (ereignis in ('gemeldet', 'eingetragen', 'nachsuche', 'geaendert',
                          'bestaetigt', 'aus_strecke', 'zurueck')),
  von        uuid references public.profiles (id) on delete set null,
  von_rolle  text
    constraint kill_verlauf_rolle_wert
      check (von_rolle in ('schuetze', 'treiber', 'gruppenleiter', 'jagdleiter',
                           'ersteller', 'revierbesitzer')),
  am         timestamptz not null default clock_timestamp(),
  vorher     jsonb,
  nachher    jsonb not null,
  grund      text
    constraint kill_verlauf_grund_wert check (grund in ('doppelt', 'fehlmeldung'))
);

create index kill_verlauf_kill_am_idx on public.kill_verlauf (kill_id, am);

alter table public.kill_verlauf enable row level security;

-- SELECT bleibt auch fuer `anon`: ohne das Recht wirft eine Zaehlung 42501
-- statt 0 Zeilen (die Policy gilt nur `authenticated`).
revoke insert, update, delete, truncate, references, trigger
  on public.kill_verlauf from anon, authenticated, service_role;

create policy kill_verlauf_lesen on public.kill_verlauf
  for select to authenticated
  using (exists (select 1 from public.kills k where k.id = kill_verlauf.kill_id));

comment on table public.kill_verlauf is
  '152: Verlauf je Erlegung (gemeldet, eingetragen, nachsuche, geaendert, bestaetigt, aus_strecke, zurueck). Nur anhaengen, einziger Schreiber trg_kills_verlauf. vorher/nachher: Schnappschuss (Art, Name nur bei Katalogarten, Geschlecht, Status, Treiben samt Name, Ort, Kontrolle).';
comment on column public.kill_verlauf.von is
  '152: SET NULL greift nur, wenn eine profiles-Zeile wirklich faellt (132 loescht weich). Anzeige bei null: geloeschtes Konto.';

-- ---------------------------------------------------------------------------
-- 5. Ort eines Erlegers (E-B3)
-- ---------------------------------------------------------------------------
-- Quelle sind die Tabellen selbst, nicht `staende_der_teilnahme` (die filtert
-- nach der Freigabe der Staende, 146). Die Bindung des Kartenobjekts uebernehmen
-- sie trotzdem (Abweichung b): `hunt_seat_assignments.seat_id` und
-- `hunt_drive_stands.map_object_id` schreibt die Leitung frei, auf JEDES
-- Objekt. Ohne Bindung laese sie am eigenen Eintrag den Ort eines Objekts ab,
-- das sie nicht sieht.
-- INVOKER, EXECUTE fuer niemanden: gerufen nur aus DEFINER-Funktionen.

create function public.stand_ort_im_treiben(p_teilnahme uuid, p_treiben uuid)
  returns extensions.geometry
  language sql
  stable
  security invoker
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
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
   where ds.drive_id = p_treiben
     and ds.participant_id = p_teilnahme;
$$;

-- Nur Konten: ein Gast hat keinen Jagdsitz, nur Treiben-Staende (CP-123).
create function public.sitz_ort_der_jagd(p_teilnahme uuid)
  returns extensions.geometry
  language sql
  stable
  security invoker
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
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
   where t.id = p_teilnahme;
$$;

-- ---------------------------------------------------------------------------
-- 6. Herkunft: Fremdeintrag (E-B2, E-B3, E-B4, E-B5)
-- ---------------------------------------------------------------------------
-- Live-Text vom 12.11.2026; neu ist der Zweig `v_fremd` und das Setzen der
-- Kontrollspalten. Fremdeintrag = die Erleger-Teilnahme (`participant_id`)
-- gehoert nicht dem Melder (Gast eingeschlossen). Die Eigenmeldung laeuft
-- unveraendert; ihre Pruefung `p.user_id = new.reporter_id` steckt jetzt in
-- `not v_fremd`.
-- `extensions` im search_path: Ad-hoc-Sitze brauchen `st_makepoint`.

create or replace function public.set_kill_herkunft()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_schein_revier uuid;
  v_jagd_revier   uuid;
  v_ersteller     uuid;
  v_tag           date;
  -- 152
  v_erleger       public.hunt_participants%rowtype;
  v_fremd         boolean := false;
  v_art           public.hunt_kind;
  v_gesichert     timestamptz;
  v_ende          timestamptz;
  v_stufe         text;
  v_treiben       uuid;
  v_treiben_jagd  uuid;
begin
  if tg_op = 'UPDATE' then
    if new.hunting_license_id is distinct from old.hunting_license_id then
      raise exception 'Der Begehungsschein einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.district_id is distinct from old.district_id then
      raise exception 'Das Revier einer Erlegung wird abgeleitet, nicht gesetzt'
        using errcode = 'insufficient_privilege';
    end if;
    if new.hunt_id is distinct from old.hunt_id then
      raise exception 'Die Jagd einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.erlegt_am is distinct from old.erlegt_am then
      raise exception 'Der Zeitpunkt einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.participant_id is distinct from old.participant_id then
      raise exception 'Die Teilnehmerzeile einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- 152: Melder ist der Aufrufer. RLS (`kills_reporter`) prueft das erst NACH
  -- diesem Trigger; ohne den Riegel hier antwortete der Trigger einem Client
  -- mit gefaelschter `reporter_id` je nach Teilnahme verschieden (Codex Delta
  -- 13.11.2026, D3). Weiche an der Rolle des Aufrufers (`current_setting('role')`
  -- zeigt sie auch im DEFINER, gemessen): `anon` und `authenticated` muessen,
  -- Server-Wege (`none`, `service_role`) nicht. `anon` hat INSERT auf `kills` und
  -- kaeme sonst ohne Konto an das Orakel (Fable Delta 2, E3).
  -- `reporter_id is null` ausdruecklich: fuer `anon` ist `auth.uid()` null, und
  -- `null is distinct from null` ist falsch (Codex Delta 3, F1).
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated')
     and (new.reporter_id is null or new.reporter_id is distinct from auth.uid()) then
    raise exception 'Melder ist immer das eigene Konto'
      using errcode = 'insufficient_privilege';
  end if;

  new.erlegt_am := coalesce(new.erlegt_am, now());
  -- 152: nur ein Fremdeintrag behaelt das mitgeschickte Treiben (E-B4).
  v_treiben := new.drive_id;
  new.drive_id := null;
  -- 152: den Kontrollzustand setzt nur der Server (E-B5).
  new.kontrolle := null;
  new.kontrolle_von := null;
  new.kontrolle_am := null;
  new.kontrolle_stufe := null;

  if new.erlegt_am > now() + interval '15 minutes' then
    raise exception 'Der Zeitpunkt einer Erlegung kann nicht in der Zukunft liegen'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.participant_id is not null then
    select * into v_erleger
      from public.hunt_participants p
     where p.id = new.participant_id;
    if not found or v_erleger.hunt_id is distinct from new.hunt_id then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
    v_fremd := v_erleger.user_id is distinct from new.reporter_id;
  end if;

  if v_fremd then
    -- Die Stufe des AUFRUFERS, nicht von `new.reporter_id`: RLS prueft den
    -- Melder erst nach diesem Trigger (FALLEN). Vor der Sperre, damit ein
    -- Konto ohne Stufe keine Jagdzeile sperrt und nichts ueber sie erfaehrt.
    -- Die Scheinpruefung des Erstellers am Tag von `erlegt_am` gilt hier
    -- nicht: das Recht kommt aus der Leitung (E-B2).
    -- Ohne Stufe DIESELBE Meldung wie oben, wie heute fuer jeden Nicht-Melder:
    -- sonst verriete der Unterschied einem Fremden, ob eine Teilnahme zu einer
    -- Jagd gehoert (Codex 13.11.2026, A2).
    v_stufe := public.kontroll_stufe(new.hunt_id);
    if v_stufe is null then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;

    -- Treiben (E-B4). Gibt es das Treiben nicht mehr, bleibt der Eintrag ohne
    -- -- sonst verwuerfe der Postausgang ihn an 23503. `for key share` haelt ein
    -- gleichzeitiges Loeschen bis zum Ende dieser Transaktion auf (Codex V3 DB-P4).
    -- VOR der Jagd-Sperre (Codex 13.11.2026, A11): das Loeschen eines Treibens
    -- sperrt Treiben -> Erlegungen (SET NULL) -> Jagd (Aktivitaet). Hielte der
    -- Fremdeintrag zuerst die Jagd und wartete dann auf das Treiben, liefen
    -- beide in einen Deadlock (lokal gemessen, `rennen-a11b4.sh`).
    if v_treiben is not null then
      select d.hunt_id into v_treiben_jagd
        from public.hunt_drives d
       where d.id = v_treiben
         for key share;
      if not found then
        v_treiben := null;
      elsif v_treiben_jagd is distinct from new.hunt_id then
        raise exception 'Das Treiben gehoert nicht zu dieser Jagd'
          using errcode = 'insufficient_privilege';
      end if;
      new.drive_id := v_treiben;
    end if;

    -- Abweichung a (Kopf): `for no key update`. Haelt `jagd_sichern` auf
    -- (Fable F9, Codex V4 DB-P8) und laesst zwei gleichzeitige Fremdeintraege
    -- nacheinander laufen; mit `for share` stuenden beide beim Aktivitaets-
    -- UPDATE derselben Zeile gegeneinander.
    select h.district_id, h.kind, h.gesichert_am, h.ended_at
      into v_jagd_revier, v_art, v_gesichert, v_ende
      from public.hunts h
     where h.id = new.hunt_id
       for no key update;
    -- Nach dem Sperrwarten neu: wer waehrenddessen die Stufe verloren hat, traegt
    -- nicht mehr ein (Codex Delta 13.11.2026, D2). Die Pruefung oben bleibt, damit
    -- ohne Stufe keine Sperre entsteht.
    v_stufe := public.kontroll_stufe(new.hunt_id);
    if v_stufe is null then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
    -- Ebenso der Erleger (entfernt, abgesagt, Konto geloescht -- Pruefung unten)
    -- und die Jagd des Treibens: `for key share` haelt das Treiben fest, nicht
    -- seine `hunt_id` (Codex Delta 2 E10/E2, Fable Delta 2 E1).
    select * into v_erleger from public.hunt_participants p where p.id = new.participant_id;
    if not found then
      raise exception 'Die Teilnehmerzeile gehoert nicht zu dieser Jagd und diesem Melder'
        using errcode = 'insufficient_privilege';
    end if;
    if v_treiben is not null then
      select d.hunt_id into v_treiben_jagd from public.hunt_drives d where d.id = v_treiben;
      if v_treiben_jagd is distinct from new.hunt_id then
        raise exception 'Das Treiben gehoert nicht zu dieser Jagd'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    if v_art = 'solo' then
      raise exception 'In einer Einzeljagd traegt man nicht fuer andere ein'
        using errcode = 'insufficient_privilege';
    end if;
    if v_gesichert is not null then
      raise exception 'Diese Jagd ist gesichert -- es laesst sich nichts mehr eintragen'
        using errcode = 'insufficient_privilege';
    end if;
    -- Erleger: nicht entfernt, nicht abgesagt, kein geloeschtes Konto. `left`
    -- zaehlt: wer frueh gegangen ist, hat trotzdem geschossen.
    if v_erleger.entfernt_am is not null
       or coalesce(v_erleger.status, 'invited') not in ('invited', 'joined', 'left')
       or exists (select 1 from public.konto_loeschungen k
                   where k.user_id = v_erleger.user_id) then
      raise exception 'Fuer diesen Teilnehmer laesst sich nichts mehr eintragen'
        using errcode = 'insufficient_privilege';
    end if;
    if new.hunting_license_id is not null then
      raise exception 'Ein Eintrag fuer andere traegt keinen Begehungsschein'
        using errcode = 'insufficient_privilege';
    end if;

    -- Ort (E-B3): Stand im Treiben, sonst Jagdsitz, sonst der GPS-Punkt, den
    -- der Client nur bei offener Jagd mitschickt, sonst ohne Ort.
    new.position := coalesce(public.stand_ort_im_treiben(new.participant_id, new.drive_id),
                             public.sitz_ort_der_jagd(new.participant_id),
                             new.position);

    -- Zeit (E-B4): kein Stueck hinter das Jagdende.
    if v_ende is not null then
      new.erlegt_am := least(new.erlegt_am, v_ende);
    end if;

    new.kontrolle       := 'eingetragen';
    new.kontrolle_von   := new.reporter_id;
    new.kontrolle_am    := now();
    new.kontrolle_stufe := v_stufe;
    new.district_id     := v_jagd_revier;
    return new;
  end if;

  if new.hunt_id is not null then
    select h.district_id, h.creator_id into v_jagd_revier, v_ersteller
      from public.hunts h
     where h.id = new.hunt_id;

    if v_ersteller = new.reporter_id then
      if v_jagd_revier is not null
         and not exists (select 1 from public.districts d
                          where d.id = v_jagd_revier and d.owner_id = new.reporter_id)
         and not exists (select 1 from public.hunting_licenses l
                          where l.district_id = v_jagd_revier
                            and l.holder_id = new.reporter_id
                            and l.status = 'aktiv'
                            and (new.erlegt_am at time zone 'Europe/Berlin')::date
                                between l.valid_from and l.valid_until)
      then
        raise exception 'Zum Revier dieser Jagd bist du zum Zeitpunkt der Erlegung nicht berechtigt'
          using errcode = 'insufficient_privilege';
      end if;

    elsif not exists (select 1
                        from public.hunt_participants p
                       where p.hunt_id = new.hunt_id
                         and p.user_id = new.reporter_id
                         and coalesce(p.status, 'invited') in ('invited', 'joined'))
    then
      raise exception 'Zu dieser Jagd gehoerst du nicht'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.hunting_license_id is null then
    new.district_id := v_jagd_revier;
    return new;
  end if;

  v_tag := (new.erlegt_am at time zone 'Europe/Berlin')::date;

  select l.district_id into v_schein_revier
    from public.hunting_licenses l
   where l.id = new.hunting_license_id
     and l.holder_id = new.reporter_id
     and l.status = 'aktiv'
     and v_tag between l.valid_from and l.valid_until;

  if v_schein_revier is null then
    raise exception 'Begehungsschein gehoert nicht zum Melder oder war zum Zeitpunkt der Erlegung nicht gueltig'
      using errcode = 'insufficient_privilege';
  end if;

  if v_jagd_revier is not null and v_jagd_revier <> v_schein_revier then
    raise exception 'Begehungsschein und Jagd gehoeren zu verschiedenen Revieren'
      using errcode = 'integrity_constraint_violation';
  end if;

  new.district_id := v_schein_revier;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Katalog: Artwechsel nur ueber den Server (E-B6)
-- ---------------------------------------------------------------------------
-- Live-Text; neu ist allein der Durchlass oben im UPDATE-Zweig. Die RPC
-- leitet Enum und Trichinen selbst neu ab (nicht geklebt, Frischling -> Reh
-- wird `false`). Oben in der Funktion naehme der Durchlass jedem Server-
-- INSERT die Ableitung (Fable F9). `set_trichinen_pflicht` bleibt unberuehrt.

create or replace function public.set_kill_katalog()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_enum      wild_art;
  v_gruppe    text;
  v_trichinen boolean;
begin
  if tg_op = 'UPDATE' then
    -- 152: Server-Weg (`erlegung_kontrollieren`), Bauform 133.
    if current_user not in ('authenticated', 'anon') then
      return new;
    end if;
    if new.wildart_id is distinct from old.wildart_id
       or (new.wildart_id is not null and new.wild_art is distinct from old.wild_art)
    then
      raise exception 'Die Wildart einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    if new.wildart_id is not null
       and coalesce(old.trichinen_pflicht, false)
       and not coalesce(new.trichinen_pflicht, false) then
      new.trichinen_pflicht := true;
    end if;
    return new;
  end if;

  if new.wildart_id is null then
    return new;
  end if;

  select w.enum_wert, w.gruppe, w.trichinenpflichtig
    into v_enum, v_gruppe, v_trichinen
    from public.wildarten w
   where w.id = new.wildart_id;

  if not found then
    raise exception 'Diese Wildart gibt es nicht oder sie ist fuer dich nicht sichtbar'
      using errcode = 'insufficient_privilege';
  end if;

  new.wild_art := coalesce(v_enum, 'sonstiges'::wild_art);

  if coalesce(v_trichinen, false) or v_gruppe = 'schwarzwild' then
    new.trichinen_pflicht := true;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Zeit-Zuordnung laesst kontrollierte Stuecke aus (E-B4)
-- ---------------------------------------------------------------------------
-- "Ohne Treiben" eingetragen bleibt ohne Treiben. `trg_kills_herkunft` laeuft
-- alphabetisch vor `trg_kills_set_drive_id` und hat `kontrolle` schon gesetzt.
-- Nebenwirkung, gewollt: auch eine kontrollierte Eigenmeldung haengt der
-- Backfill nicht mehr um.

create or replace function public.set_kill_drive_id()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
DECLARE
  t timestamptz;
BEGIN
  IF NEW.drive_id IS NOT NULL OR NEW.hunt_id IS NULL OR NEW.kontrolle IS NOT NULL THEN
    RETURN NEW;
  END IF;

  t := COALESCE(NEW.erlegt_am, now());

  SELECT d.id INTO NEW.drive_id
  FROM public.hunt_drives d
  WHERE d.hunt_id = NEW.hunt_id
    AND d.started_at IS NOT NULL
    AND t >= d.started_at - interval '30 minutes'
    AND (d.ended_at IS NULL OR t <= d.ended_at + interval '15 minutes')
  ORDER BY
    CASE
      WHEN t >= d.started_at AND (d.ended_at IS NULL OR t <= d.ended_at) THEN 0  -- core
      WHEN d.ended_at IS NOT NULL AND t > d.ended_at                     THEN 1  -- tail
      ELSE 2                                                                     -- lead
    END,
    d.started_at DESC
  LIMIT 1;

  RETURN NEW;
END;
$$;

create or replace function public.backfill_kills_on_drive_start()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
BEGIN
  UPDATE public.kills
     SET drive_id = NEW.id
   WHERE hunt_id = NEW.hunt_id
     AND drive_id IS NULL
     AND kontrolle IS NULL
     AND COALESCE(erlegt_am, created_at) >= NEW.started_at - interval '30 minutes'
     AND COALESCE(erlegt_am, created_at) <= NEW.started_at;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Spiegel: kein Spiegel fuer Fremdeintraege (E-B9)
-- ---------------------------------------------------------------------------
-- Live-Text; neu ist der Ausstieg nach dem DELETE-Zweig. Er gilt fuer INSERT
-- UND UPDATE: der Zweig `new.wild_event_id is null` legte sonst bei jedem
-- spaeteren UPDATE eines Fremdeintrags einen Spiegel an (Fable F11).
-- DELETE: ein Fremdeintrag hat keinen Spiegel, `old.wild_event_id` ist null.
-- 123 Teil 4 (Filter auf `user_id = reporter_id`) bleibt die tragende Linie.

create or replace function public.sync_wild_event_for_kill()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  new_event_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.wild_event_id is not null then
      delete from wild_events
       where id = old.wild_event_id
         and type = 'kill'
         and user_id = old.reporter_id;
    end if;
    return old;
  end if;

  -- 152: Fremdeintrag -> kein Spiegel.
  if new.participant_id is not null
     and not exists (select 1 from public.hunt_participants p
                      where p.id = new.participant_id
                        and p.user_id = new.reporter_id) then
    return new;
  end if;

  if new.wild_event_id is null then
    insert into wild_events
      (user_id, hunt_id, type, species, occurred_at, location, created_at)
    values (
      new.reporter_id,
      new.hunt_id,
      'kill'::wild_event_type,
      new.wild_art::text,
      coalesce(new.erlegt_am, new.created_at),
      new.position::geography,
      new.created_at
    )
    returning id into new_event_id;

    update kills set wild_event_id = new_event_id where id = new.id;
    return new;
  end if;

  if tg_op = 'UPDATE' and (
       new.hunt_id     is distinct from old.hunt_id
    or new.wild_art    is distinct from old.wild_art
    or coalesce(new.erlegt_am, new.created_at)
         is distinct from coalesce(old.erlegt_am, old.created_at)
    or new.position    is distinct from old.position
  ) then
    update wild_events set
      hunt_id     = new.hunt_id,
      species     = new.wild_art::text,
      occurred_at = coalesce(new.erlegt_am, new.created_at),
      location    = new.position::geography
    where id = new.wild_event_id
      and type = 'kill'
      and user_id = new.reporter_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. `wild_event_id`: ein Client setzt sie nicht von null auf einen Wert
--     (E-B9, schliesst 123 Teil 3)
-- ---------------------------------------------------------------------------
-- Fremdeintraege sind die ersten Zeilen, bei denen sie dauerhaft null bleibt.
-- Durchlass nur fuer den Server-Weg (`sync_wild_event_for_kill` ist DEFINER).
-- Wert -> null bleibt OHNE Weiche gesperrt -- das ist die Sperre gegen das
-- direkte Loeschen des Spiegels (123 Falle 1). Kein RI-Durchlass (Fable F13).

create or replace function public.kills_wild_event_id_ist_server_sache()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
begin
  -- Beim Anlegen bestimmt der Client sie NIE. Ein mitgeschickter Wert wird
  -- still verworfen statt abgewiesen: er ist immer ein Fehler, aber nie
  -- einer, der den Melder etwas angeht — ein abgewiesener INSERT kostete
  -- eine Erlegung.
  if tg_op = 'INSERT' then
    new.wild_event_id := null;
    return new;
  end if;

  -- ⚠ NEBENWIRKUNG: `kills.wild_event_id` trägt `on delete set null` (036).
  -- Eine Referential Action läuft als gewöhnliches UPDATE und FEUERT DIESEN
  -- TRIGGER. Wer eine `wild_events`-Zeile löscht, auf die noch eine
  -- `kills`-Zeile zeigt, bekommt deshalb 42501. Das ist der gewollte Ausgang
  -- (es schliesst den SET-NULL-Weg), aber eine Verhaltensänderung.
  if old.wild_event_id is not null
     and new.wild_event_id is distinct from old.wild_event_id then
    raise exception 'Die Verknuepfung einer Erlegung steht fest'
      using errcode = 'insufficient_privilege';
  end if;

  -- 152: null -> Wert nur der Server.
  if old.wild_event_id is null
     and new.wild_event_id is not null
     and current_user in ('authenticated', 'anon') then
    raise exception 'Die Verknuepfung einer Erlegung setzt nur der Server'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Schutz nach einer Kontrolle (E-B5, E-B6, E-B7)
-- ---------------------------------------------------------------------------
-- INVOKER, Bauform 133: Server-Wege laufen als Besitzer durch.
-- UPDATE: die vier Kontrollspalten aendert kein Client. Ist das Stueck
-- kontrolliert (auch `eingetragen`, `doppelt`, `fehlmeldung`), darf ein
-- Client nur noch `notiz`, `gewicht_kg`, `kapital`, `distance_m` aendern --
-- eine ERLAUBNISliste, damit jede kuenftige Spalte zu ist (Fable F6).
-- `updated_at` setzt `trg_kills_updated` ohnehin neu; ein mitgeschickter Wert
-- ist harmlos und bricht deshalb nichts.
-- DELETE: die Eigenmeldung nach jeder Kontrolle nicht mehr (`P0001`, eigener
-- Code fuer "kontrolliert", E-B6); ein Fremdeintrag, bis die Leitung ihn
-- bestaetigt hat -- danach nur, wenn der Loeschende selbst Leitung ist.
-- Loeschen darf per RLS (`kills_reporter`) ohnehin nur der Melder.

create function public.kill_kontrolle_schutz()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public', 'pg_temp'
as $$
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

    if old.kontrolle is not null
       and (to_jsonb(new) - array['notiz', 'gewicht_kg', 'kapital', 'distance_m', 'updated_at'])
           is distinct from
           (to_jsonb(old) - array['notiz', 'gewicht_kg', 'kapital', 'distance_m', 'updated_at']) then
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
$$;

-- Alphabetisch nach `_herkunft` und `_katalog` (096).
create trigger trg_kills_kontrolle
  before update or delete on public.kills
  for each row execute function public.kill_kontrolle_schutz();

-- ---------------------------------------------------------------------------
-- 12. Verlauf schreiben (E-B5) -- der EINZIGE Schreibweg
-- ---------------------------------------------------------------------------
-- if/elsif: die erste zutreffende Regel gewinnt, genau ein Ereignis je Zeile
-- und Anweisung. Reihenfolge (Fable F4, Codex V4 DB-P6 -- umgekehrt entstand
-- `zurueck` nie): zuerst "aus der Strecke zurueck", dann der Uebergang nach
-- dem neuen Wert -- nur, wenn sich `kontrolle_am` aendert (das setzt allein
-- die RPC; ein RI-`SET NULL` auf `kontrolle_von` erzeugt kein Phantom).
-- Danach Aenderungen ohne Kontrolle (alter Build, `updateKill`, Treiben-
-- Backfill, RI beim Loeschen eines Treibens).
-- Knoepfe, Haken und Sperren haengen an den SPALTEN, nie am juengsten
-- Ereignis: Spalte und Ereignis koennen auseinanderlaufen (Fable F5).

create function public.kill_stand(k public.kills)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
  -- Wildart-Name nur bei Katalogarten: sonst laese jeder, der das Stueck
  -- sieht, den Namen einer privaten Art (Fable DB-P4). Treiben-Name, weil das
  -- Treiben spaeter geloescht sein kann (Fable F6).
  select jsonb_build_object(
           'wildart_id',      k.wildart_id,
           'wild_art',        k.wild_art,
           'wildart_name',    (select w.name from public.wildarten w
                                where w.id = k.wildart_id and w.besitzer_id is null),
           'geschlecht',      k.geschlecht,
           'status',          k.status,
           'drive_id',        k.drive_id,
           'drive_name',      (select d.name from public.hunt_drives d where d.id = k.drive_id),
           'ort',             st_asgeojson(k.position)::jsonb,
           'kontrolle',       k.kontrolle,
           'kontrolle_von',   k.kontrolle_von,
           'kontrolle_stufe', k.kontrolle_stufe,
           'kontrolle_am',    k.kontrolle_am);
$$;

create function public.kill_verlauf_schreiben()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_ereignis text;
  v_von      uuid;
  v_grund    text;
  v_rolle    text;
begin
  if tg_op = 'INSERT' then
    v_von := new.reporter_id;
    v_ereignis := case
                    when new.status = 'wounded' then 'nachsuche'
                    when new.kontrolle = 'eingetragen' then 'eingetragen'
                    else 'gemeldet'
                  end;
  else
    v_von := auth.uid();
    if old.kontrolle in ('doppelt', 'fehlmeldung')
       and coalesce(new.kontrolle, '') not in ('doppelt', 'fehlmeldung') then
      v_ereignis := 'zurueck';
    elsif new.kontrolle_am is distinct from old.kontrolle_am then
      v_ereignis := case new.kontrolle
                      when 'bestaetigt'  then 'bestaetigt'
                      when 'korrigiert'  then 'geaendert'
                      when 'doppelt'     then 'aus_strecke'
                      when 'fehlmeldung' then 'aus_strecke'
                    end;
      if v_ereignis = 'aus_strecke' then
        v_grund := new.kontrolle;
      end if;
    elsif (new.wildart_id, new.wild_art, new.geschlecht, new.status, new.drive_id)
            is distinct from
          (old.wildart_id, old.wild_art, old.geschlecht, old.status, old.drive_id)
       or new.position is distinct from old.position then
      v_ereignis := 'geaendert';
    end if;

    if v_ereignis is null then
      return null;
    end if;
  end if;

  -- Rolle zum Zeitpunkt (Schnappschuss). Jagdleiter vor Ersteller: so
  -- heisst die Rolle, die der Ersteller in seiner Jagd fast immer traegt.
  select case
           when v_von is null then null
           when t.role = 'jagdleiter' then 'jagdleiter'
           when h.creator_id = v_von then 'ersteller'
           when d.owner_id = v_von then 'revierbesitzer'
           when 'gruppenleiter' = any (t.tags) then 'gruppenleiter'
           when t.role = 'treiber' then 'treiber'
           when t.id is not null then 'schuetze'
         end
    into v_rolle
    from public.hunts h
    left join public.districts d on d.id = h.district_id
    left join public.hunt_participants t on t.hunt_id = h.id and t.user_id = v_von
   where h.id = new.hunt_id;

  insert into public.kill_verlauf (kill_id, ereignis, von, von_rolle, vorher, nachher, grund)
  values (new.id, v_ereignis, v_von, v_rolle,
          case when tg_op = 'UPDATE' then public.kill_stand(old) end,
          public.kill_stand(new),
          v_grund);

  return null;
end;
$$;

create trigger trg_kills_verlauf
  after insert or update on public.kills
  for each row execute function public.kill_verlauf_schreiben();

-- ---------------------------------------------------------------------------
-- 13. Aktivitaet: eine Kontrolle schiebt das Auto-Ende nicht (E-B6)
-- ---------------------------------------------------------------------------
-- `update_hunt_last_activity` bleibt unangetastet -- sie haengt an vier
-- Tabellen, ein Feldzugriff auf `new.kontrolle` darin liesse jeden Upsert auf
-- `positions_current` scheitern (Fable F10, Codex V3 DB-P14). Stattdessen der
-- Trigger geteilt. WHEN mit OLD geht nur am reinen UPDATE-Trigger.
-- `kontrolle_am` aendert sich bei jedem Uebergang der RPC, auch bei einem
-- zweiten `aendern` desselben Pruefers (Fable F3, Codex V4 DB-P3).

drop trigger trg_kills_activity on public.kills;

create trigger trg_kills_activity
  after insert on public.kills
  for each row execute function public.update_hunt_last_activity();

create trigger trg_kills_activity_upd
  after update on public.kills
  for each row
  when (old.kontrolle_am is not distinct from new.kontrolle_am)
  execute function public.update_hunt_last_activity();

-- ---------------------------------------------------------------------------
-- 14. Kontrolle (E-B6)
-- ---------------------------------------------------------------------------
-- Aktionen: bestaetigen | aendern (p_ziel: wildart_id, geschlecht, drive_id;
-- null heisst null -- ausser wildart_id an einem Enum-Stueck: "Art bleibt") |
-- aus_strecke (p_grund doppelt|fehlmeldung) | zurueck.
-- p_erwartet: der Stand, den der Client gesehen hat (wildart_id, wild_art,
-- geschlecht, drive_id, status, kontrolle, kontrolle_von, kontrolle_stufe).
-- Antwort: {ergebnis: ok|unveraendert|ueberholt|nicht_sichtbar, stand}.
-- Endgueltige Ablehnung: 42501 mit HINT nicht_berechtigt|gesichert|selbst|
-- einzeljagd|nachsuche|uebergang|art|treiben -- der Client zeigt den Grund (E-B6).
--
-- Auswertungsreihenfolge (Fassung 4.1, Fable F1, Codex V4 DB-P1):
--  1. Recht: Stufe des Aufrufers (vor den Sperren und danach neu), Sicht,
--     gesichert, Selbstkontrolle, Einzeljagd, Nachsuche (am erwarteten Stand).
--     "Sieht" = dieselbe Bedingung wie das Recht -- Leitung immer, sonst
--     `erlegung_in_sicht` oder Melder (Fable F5). Wer nicht sieht, bekommt
--     `nicht_sichtbar`, keinen Grund: ein inzwischen `wounded` gestelltes
--     Stueck laege sonst an RLS vorbei beim Gruppenleiter (Fable F11).
--  2. Ist = Ziel -> `unveraendert`. Jede Wiederholung nach verlorener Antwort
--     ist damit ein Erfolg, auch die von `zurueck`.
--  3. Ist != p_erwartet -> `ueberholt` mit Stand.
--  4. Erst dann die Tabelle (Bauplan E-B6); ihr "abgelehnt" gibt es nur bei
--     Ist = p_erwartet. "Gruppenleiter auf Leitungs-Stufe" haengt am Zustand
--     des Stuecks und steht hier; `wounded` steht seit Codex Delta D5 unter 1.
-- Compare-and-Swap ueber die Feldwerte samt der drei Kontrollspalten: von zwei
-- gleichzeitigen Kontrollen gewinnt genau eine. Die Gruppenleiter-Grenze steht
-- zusaetzlich im WHERE (Fable F11, Rennen mit vorhergesagtem p_erwartet).
-- Die RPC schreibt nur Spalten, nie den Verlauf (der AFTER-Trigger tut es).

create function public.erlegung_kontrollieren(
  p_kill     uuid,
  p_aktion   text,
  p_erwartet jsonb,
  p_ziel     jsonb default null,
  p_grund    text  default null)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  k             public.kills%rowtype;
  v_ich         uuid := auth.uid();
  v_stufe       text;
  v_gesichert   timestamptz;
  v_erleger_uid uuid;
  v_fremd       boolean;
  v_ort_neu     boolean := false;
  v_art_roh     uuid;
  v_enum        public.wild_art;
  v_gruppe      text;
  v_tp          boolean;
  v_treiben_jagd uuid;
  v_treiben_ziel uuid;
  v_art          public.hunt_kind;
  v_treiben_da   boolean := false;
  e_wildart     uuid;
  e_wild_art    public.wild_art;
  e_geschlecht  public.geschlecht;
  e_drive       uuid;
  e_status      public.kill_status;
  e_kontrolle   text;
  e_von         uuid;
  e_stufe       text;
  z_wildart     uuid;
  z_wild_art    public.wild_art;
  z_trichinen   boolean;
  z_geschlecht  public.geschlecht;
  z_drive       uuid;
  z_position    extensions.geometry;
  z_kontrolle   text;
begin
  if v_ich is null then
    raise exception 'Nicht angemeldet' using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if p_aktion is null or p_aktion not in ('bestaetigen', 'aendern', 'aus_strecke', 'zurueck') then
    raise exception 'Unbekannte Aktion' using errcode = '22023';
  end if;
  if p_erwartet is null or jsonb_typeof(p_erwartet) <> 'object'
     or not (p_erwartet ?& array['wildart_id', 'wild_art', 'geschlecht', 'drive_id', 'status',
                                 'kontrolle', 'kontrolle_von', 'kontrolle_stufe']) then
    raise exception 'p_erwartet braucht alle acht Felder' using errcode = '22023';
  end if;
  if p_aktion = 'aendern'
     and (p_ziel is null or jsonb_typeof(p_ziel) <> 'object'
          or not (p_ziel ?& array['wildart_id', 'geschlecht', 'drive_id'])) then
    raise exception 'p_ziel braucht wildart_id, geschlecht und drive_id' using errcode = '22023';
  end if;
  if p_aktion = 'aus_strecke' and (p_grund is null or p_grund not in ('doppelt', 'fehlmeldung')) then
    raise exception 'Grund: doppelt oder fehlmeldung' using errcode = '22023';
  end if;

  e_wildart    := (p_erwartet ->> 'wildart_id')::uuid;
  e_wild_art   := (p_erwartet ->> 'wild_art')::public.wild_art;
  e_geschlecht := (p_erwartet ->> 'geschlecht')::public.geschlecht;
  e_drive      := (p_erwartet ->> 'drive_id')::uuid;
  e_status     := (p_erwartet ->> 'status')::public.kill_status;
  e_kontrolle  := p_erwartet ->> 'kontrolle';
  e_von        := (p_erwartet ->> 'kontrolle_von')::uuid;
  e_stufe      := p_erwartet ->> 'kontrolle_stufe';

  select * into k from public.kills where id = p_kill;
  if not found then
    return jsonb_build_object('ergebnis', 'nicht_sichtbar');
  end if;

  -- 1. Recht (vor jeder Sperre: ohne Stufe sperrt niemand eine Zeile)
  v_stufe := public.kontroll_stufe(k.hunt_id);
  if v_stufe is null then
    raise exception 'Fuer diese Jagd nicht (mehr) berechtigt'
      using errcode = '42501', hint = 'nicht_berechtigt';
  end if;

  -- Sperrfolge Erlegung -> Treiben -> Jagd (FALLEN), wie jeder Client-Schreibweg
  -- an `kills` (Zeile, dann ueber den Aktivitaets-Trigger die Jagd) und das
  -- Loeschen eines Treibens. Andersherum lief ein gleichzeitiger Notiz-Nachtrag am
  -- selben Stueck (Codex B4) bzw. das Loeschen des Ziel-Treibens (Codex Delta D2)
  -- in einen Deadlock. Die Zeile wird neu gelesen, weil sie sich seit dem ersten
  -- Lesen geaendert haben kann; ihre `hunt_id` ist fest (`set_kill_herkunft`,
  -- UPDATE-Zweig, fuer jede Rolle).
  select * into k from public.kills where id = p_kill for no key update;
  if not found then
    return jsonb_build_object('ergebnis', 'nicht_sichtbar');
  end if;
  if p_aktion = 'aendern' then
    v_treiben_ziel := (p_ziel ->> 'drive_id')::uuid;
    if v_treiben_ziel is not null and v_treiben_ziel is distinct from k.drive_id then
      select d.hunt_id into v_treiben_jagd
        from public.hunt_drives d
       where d.id = v_treiben_ziel
         for key share;
      v_treiben_da := found;
    end if;
  end if;

  -- Gegen das Sichern (Fable F9, Codex V4 DB-P8): `jagd_sichern` wartet bis
  -- zum Ende dieser Kontrolle, oder die Kontrolle liest danach "gesichert".
  -- Kein Hochstufen-Problem: diese Transaktion schreibt `hunts` nie (die
  -- Aktivitaet feuert nicht, `kontrolle_am` aendert sich).
  select h.gesichert_am, h.kind into v_gesichert, v_art
    from public.hunts h
   where h.id = k.hunt_id
     for share;
  -- Nach dem Sperrwarten neu: wer waehrenddessen die Stufe verloren oder
  -- gewechselt hat, kontrolliert mit der Stufe von jetzt (Codex Delta D2).
  v_stufe := public.kontroll_stufe(k.hunt_id);
  if v_stufe is null then
    raise exception 'Fuer diese Jagd nicht (mehr) berechtigt'
      using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if not (v_stufe = 'leitung' or k.reporter_id = v_ich or public.erlegung_in_sicht(p_kill)) then
    return jsonb_build_object('ergebnis', 'nicht_sichtbar');
  end if;
  if v_gesichert is not null then
    raise exception 'Diese Jagd ist gesichert' using errcode = '42501', hint = 'gesichert';
  end if;
  if k.participant_id is not null then
    select p.user_id into v_erleger_uid
      from public.hunt_participants p
     where p.id = k.participant_id;
  end if;
  -- Selbstkontrolle: der Aufrufer ist der Erleger, auch wenn ein anderer fuer
  -- ihn eingetragen hat (Fable F8).
  if (k.participant_id is null and k.reporter_id = v_ich) or v_erleger_uid = v_ich then
    raise exception 'Eigene Stuecke kontrolliert jemand anders'
      using errcode = '42501', hint = 'selbst';
  end if;
  -- Keine Kontrolle in der Einzeljagd (wie kein Fremdeintrag und kein Gast dort,
  -- E-B2/E-B14): es gibt keine Leitung ausser dem Jaeger selbst. Sonst sperrte ein
  -- Revierbesitzer per API einen Scheininhaber aus dessen eigenem Stueck aus
  -- (Schlusslesung 13.11.2026, B1, lokal gemessen).
  if v_art = 'solo' then
    raise exception 'In einer Einzeljagd wird nicht kontrolliert' using errcode = '42501', hint = 'einzeljagd';
  end if;
  -- Nachsuche gehoert zum Recht (E-B6, Schritt 1 -- Codex Delta D5): am Stand,
  -- auf den der Aufrufer sich bezieht. Ist das Stueck erst seither eine
  -- Nachsuche, meldet Schritt 3 `ueberholt` (Bauplan §4, Probe E10b);
  -- geschrieben wird ohnehin nur, wenn Ist = erwartet.
  if e_status = 'wounded' then
    raise exception 'Eine Nachsuche wird nicht kontrolliert' using errcode = '42501', hint = 'nachsuche';
  end if;
  v_fremd := k.participant_id is not null and v_erleger_uid is distinct from k.reporter_id;

  -- Ziel
  z_kontrolle := case p_aktion
                   when 'bestaetigen' then 'bestaetigt'
                   when 'aendern'     then 'korrigiert'
                   when 'aus_strecke' then p_grund
                   else 'bestaetigt'               -- zurueck (Fable F7)
                 end;
  z_wild_art := e_wild_art;
  if p_aktion = 'aendern' then
    v_art_roh := (p_ziel ->> 'wildart_id')::uuid;
    -- An einem Katalog-Stueck laesst sich die Art nicht entfernen; an einem
    -- Enum-Stueck heisst null "Art bleibt" (Fable F8).
    if v_art_roh is null and e_wildart is not null then
      raise exception 'Eine Wildart laesst sich nicht entfernen'
        using errcode = '42501', hint = 'art';
    end if;
    z_wildart    := coalesce(v_art_roh, e_wildart);
    z_geschlecht := (p_ziel ->> 'geschlecht')::public.geschlecht;
    z_drive      := (p_ziel ->> 'drive_id')::uuid;
  else
    z_wildart    := e_wildart;
    z_geschlecht := e_geschlecht;
    z_drive      := e_drive;
  end if;

  -- 2. Ist = Ziel. `aendern` ohne Feldaenderung ist `unveraendert`, macht also
  --    aus `bestaetigt` kein `korrigiert` (Fable F8).
  --    Status und Enum-Art muessen dem erwarteten Stand entsprechen, auch bei
  --    `aendern` -- sonst hiesse ein inzwischen zur Nachsuche gewordenes oder vom
  --    Melder umbenanntes Enum-Stueck "unveraendert" statt `ueberholt` (Codex/Fable
  --    Delta 2 E4, Codex Delta 4 G2). AUSNAHME nur der Katalogwechsel: er leitet die
  --    Enum-Art neu ab, und seine Wiederholung nach verlorener Antwort muss
  --    `unveraendert` bleiben (Codex Delta 3, F3).
  if (k.wildart_id, k.geschlecht, k.drive_id)
       is not distinct from (z_wildart, z_geschlecht, z_drive)
     and k.status is not distinct from e_status
     and (k.wild_art is not distinct from e_wild_art
          or (p_aktion = 'aendern' and z_wildart is distinct from e_wildart))
     and (p_aktion = 'aendern'
          or (k.kontrolle, k.kontrolle_von, k.kontrolle_stufe)
               is not distinct from (z_kontrolle, v_ich, v_stufe)) then
    return jsonb_build_object('ergebnis', 'unveraendert', 'stand', public.kill_stand(k));
  end if;

  -- 3. Ist != p_erwartet
  if (k.wildart_id, k.wild_art, k.geschlecht, k.drive_id, k.status,
      k.kontrolle, k.kontrolle_von, k.kontrolle_stufe)
       is distinct from
     (e_wildart, e_wild_art, e_geschlecht, e_drive, e_status,
      e_kontrolle, e_von, e_stufe) then
    return jsonb_build_object('ergebnis', 'ueberholt', 'stand', public.kill_stand(k));
  end if;

  -- 4. Tabelle (Ist = p_erwartet; die Nachsuche ist schon Schritt 1)
  if v_stufe = 'gruppenleiter' and k.kontrolle_stufe = 'leitung' then
    raise exception 'Von der Jagdleitung entschieden' using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if p_aktion in ('bestaetigen', 'aendern') and k.kontrolle in ('doppelt', 'fehlmeldung') then
    raise exception 'Erst zurueck in die Strecke' using errcode = '42501', hint = 'uebergang';
  end if;
  if p_aktion = 'zurueck' and coalesce(k.kontrolle, '') not in ('doppelt', 'fehlmeldung') then
    raise exception 'Das Stueck ist nicht aus der Strecke genommen' using errcode = '42501', hint = 'uebergang';
  end if;
  -- Gleicher Grund: nur die Leitung ueber einer Gruppenleiter-Entscheidung
  -- uebernimmt sie, sonst bleibt alles (Codex V4 DB-P1).
  if p_aktion = 'aus_strecke' and k.kontrolle = p_grund
     and not (v_stufe = 'leitung' and k.kontrolle_stufe = 'gruppenleiter') then
    return jsonb_build_object('ergebnis', 'unveraendert', 'stand', public.kill_stand(k));
  end if;

  if p_aktion = 'aendern' then
    -- Wildart nur aus dem Katalog, sichtbar fuer den Aufrufer nach der Regel
    -- von `wildarten_select` (E-B6; die vier Zweige wie in §16 -- wer eine
    -- aendert, aendert beide, Codex 13.11.2026, B12); Enum und Trichinen neu
    -- abgeleitet, nicht geklebt.
    if z_wildart is distinct from k.wildart_id then
      select w.enum_wert, w.gruppe, w.trichinenpflichtig
        into v_enum, v_gruppe, v_tp
        from public.wildarten w
       where w.id = z_wildart
         and (w.besitzer_id is null
              or w.besitzer_id = v_ich
              or exists (select 1 from public.kills x
                          where x.wildart_id = w.id and x.reporter_id = v_ich)
              or exists (select 1 from public.kills x
                          where x.wildart_id = w.id
                            and x.participant_id in (select public.meine_angenommenen_teilnahmen())));
      if not found then
        raise exception 'Diese Wildart gibt es nicht oder sie ist fuer dich nicht sichtbar'
          using errcode = '42501', hint = 'art';
      end if;
      z_wild_art  := coalesce(v_enum, 'sonstiges'::public.wild_art);
      z_trichinen := coalesce(v_tp, false) or v_gruppe = 'schwarzwild';
    end if;

    if z_drive is distinct from k.drive_id then
      -- Gesperrt (`for key share`) schon vor der Jagd, s. oben; z_drive ist
      -- derselbe Wert wie v_treiben_ziel.
      if z_drive is not null then
        -- Neu gelesen: die Sperre haelt das Treiben, nicht seine Jagd (Codex Delta 2 E2).
        if v_treiben_da then
          select d.hunt_id into v_treiben_jagd from public.hunt_drives d where d.id = z_drive;
        end if;
        if not v_treiben_da or v_treiben_jagd is distinct from k.hunt_id then
          raise exception 'Das Treiben gehoert nicht zu dieser Jagd'
            using errcode = '42501', hint = 'treiben';
        end if;
      end if;

      -- Ort beim Treibenwechsel (E-B3, Fassung 4.1): nur am Fremdeintrag --
      -- die Eigenmeldung behaelt ihren GPS-Ort. Stand im neuen Treiben ->
      -- dessen Ort; hatte er im alten einen Stand -> Jagdsitz, sonst ohne
      -- Ort; sonst bleibt der Ort (er kam vom Sitz oder vom GPS).
      if v_fremd then
        z_position := public.stand_ort_im_treiben(k.participant_id, z_drive);
        if z_position is null then
          if public.stand_ort_im_treiben(k.participant_id, k.drive_id) is not null then
            z_position := public.sitz_ort_der_jagd(k.participant_id);
            v_ort_neu := true;
          end if;
        else
          v_ort_neu := true;
        end if;
      end if;
    end if;
  end if;

  update public.kills
     set wildart_id        = z_wildart,
         wild_art          = z_wild_art,
         trichinen_pflicht = coalesce(z_trichinen, trichinen_pflicht),
         geschlecht        = z_geschlecht,
         drive_id          = z_drive,
         position          = case when v_ort_neu then z_position else position end,
         kontrolle         = z_kontrolle,
         kontrolle_von     = v_ich,
         kontrolle_stufe   = v_stufe,
         kontrolle_am      = clock_timestamp()
   where id = p_kill
     and wildart_id      is not distinct from e_wildart
     and wild_art        =  e_wild_art
     and geschlecht      is not distinct from e_geschlecht
     and drive_id        is not distinct from e_drive
     and status          =  e_status
     and kontrolle       is not distinct from e_kontrolle
     and kontrolle_von   is not distinct from e_von
     and kontrolle_stufe is not distinct from e_stufe
     and (v_stufe = 'leitung' or kontrolle_stufe is distinct from 'leitung')
  returning * into k;

  if not found then
    select * into k from public.kills where id = p_kill;
    if not found
       or not (v_stufe = 'leitung' or k.reporter_id = v_ich or public.erlegung_in_sicht(p_kill)) then
      return jsonb_build_object('ergebnis', 'nicht_sichtbar');
    end if;
    return jsonb_build_object('ergebnis', 'ueberholt', 'stand', public.kill_stand(k));
  end if;

  return jsonb_build_object('ergebnis', 'ok', 'stand', public.kill_stand(k));
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Spontaner Gast (E-B14)
-- ---------------------------------------------------------------------------
-- Status `joined`: er ist da. Als `invited` stuende er nativ unter
-- "Eingeladen" und zaehlte im Portal als offene Antwort (Fable F15).
-- Kennung vom Geraet: eine Wiederholung nach verlorener Antwort legt keinen
-- zweiten Gast an. Nur online (kein neuer Postausgang-Typ).

create function public.gast_aufnehmen(p_id uuid, p_hunt uuid, p_name text)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_name      text := btrim(p_name, E' \t\r\n');
  v_art       public.hunt_kind;
  v_gesichert timestamptz;
  v_jagd      uuid;
begin
  if p_id is null or p_hunt is null then
    raise exception 'Kennung und Jagd sind Pflicht' using errcode = '22023';
  end if;
  if v_name is null or v_name = '' or char_length(v_name) > 80 then
    raise exception 'Der Name des Gastes braucht 1 bis 80 Zeichen' using errcode = '22023';
  end if;
  if public.kontroll_stufe(p_hunt) is null then
    raise exception 'Gaeste nehmen nur Jagdleitung und Gruppenleiter auf'
      using errcode = '42501', hint = 'nicht_berechtigt';
  end if;

  select h.kind, h.gesichert_am into v_art, v_gesichert
    from public.hunts h
   where h.id = p_hunt
     for share;
  -- Nach dem Sperrwarten neu, wie in Fremdeintrag und Kontrolle (Fable Delta 2, E10).
  if public.kontroll_stufe(p_hunt) is null then
    raise exception 'Gaeste nehmen nur Jagdleitung und Gruppenleiter auf'
      using errcode = '42501', hint = 'nicht_berechtigt';
  end if;
  if v_art = 'solo' then
    raise exception 'In einer Einzeljagd gibt es keine Gaeste' using errcode = '42501';
  end if;
  if v_gesichert is not null then
    raise exception 'Diese Jagd ist gesichert' using errcode = '42501', hint = 'gesichert';
  end if;

  insert into public.hunt_participants (id, hunt_id, guest_name, role, status, joined_at)
  values (p_id, p_hunt, v_name, 'schuetze', 'joined', now())
  on conflict (id) do nothing;

  select p.hunt_id into v_jagd from public.hunt_participants p where p.id = p_id;
  if v_jagd is distinct from p_hunt then
    raise exception 'Diese Kennung gehoert zu einer anderen Jagd' using errcode = '42501';
  end if;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Sicht des Erlegers (E-B8)
-- ---------------------------------------------------------------------------
-- Erst nach Annahme (`joined`, oder `left` mit `joined_at`), auch nach einem
-- Rauswurf: ein Entfernter behaelt seine Stuecke. Traegt nur mit Teil 1.

create function public.meine_angenommenen_teilnahmen()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select p.id
    from public.hunt_participants p
   where p.user_id = auth.uid()
     and (p.status = 'joined'
          or (p.status = 'left' and p.joined_at is not null));
$$;

-- `to authenticated`: die Funktion ist fuer `anon` nicht ausfuehrbar, sonst
-- wuerfe die Policy 42501 statt 0 Zeilen (AGENTS.md).
create policy kills_erleger on public.kills
  for select to authenticated
  using (participant_id in (select public.meine_angenommenen_teilnahmen()));

-- Neuer Parameter = neue Signatur: `create or replace` legte eine zweite
-- Funktion an, mit Standard-EXECUTE fuer alle. Also DROP + CREATE (keine
-- Abhaengigen in pg_depend; die SQL-Rumpfe von `anblick_in_sicht` und
-- `erlegung_in_sicht` werden beim Ausfuehren aufgeloest) und EXECUTE unten
-- namentlich wie bisher (nur der Besitzer).
-- Treiber-Regel am Erleger (F3): traegt ein Obertreiber fuer einen Schuetzen
-- ein, sehen Treiber das Stueck nicht. Ohne Erleger wie bisher am Melder.
drop function public.meldung_in_sicht(uuid, extensions.geometry, uuid);

create function public.meldung_in_sicht(
  p_hunt_id            uuid,
  p_ort                extensions.geometry,
  p_melder             uuid,
  p_erleger_teilnahme  uuid default null)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce(
    p_melder = auth.uid()
    or case public.sicht_stufe(p_hunt_id)
         when 'leitung' then true
         when 'alles'   then true
         when 'treiber' then exists (
              select 1 from public.hunt_participants p
               where p.hunt_id = p_hunt_id
                 and (p.id = p_erleger_teilnahme
                      or (p_erleger_teilnahme is null and p.user_id = p_melder))
                 and p.role = 'treiber'
                 and p.entfernt_am is null
                 and not public.steht_am_stand(p.id))
         when 'umkreis' then public.ort_in_umkreis(p_hunt_id, p_ort)
         else false
       end,
    false);
$$;

-- Live-Text; neu: "Erleger = ich" vorab (Abweichung c), Erleger an
-- `meldung_in_sicht`.
create or replace function public.erlegung_in_sicht(p_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select coalesce((
    select coalesce(k.participant_id in (select public.meine_angenommenen_teilnahmen()), false)
        or (((k.hunt_id in (select public.get_my_teilnahme_hunt_ids())
              and h.kill_visibility = 'all'::kill_visibility)
             or (k.hunt_id in (select public.get_my_joined_hunt_ids_as_leader_or_groupleader())
                 and h.kill_visibility = 'leader_and_groupleader'::kill_visibility))
            and public.meldung_in_sicht(k.hunt_id, k.position, k.reporter_id, k.participant_id)
            and (k.status <> 'wounded'::kill_status
                 or k.reporter_id = auth.uid()
                 or public.sicht_stufe(k.hunt_id) = 'leitung'))
      from public.kills k
      join public.hunts h on h.id = k.hunt_id
     where k.id = p_id), false);
$$;

-- Live-Text; neu: eine Nachsuche, deren Erleger ich bin, verbirgt das Foto
-- nicht. Je Stueck: ein zusaetzliches fremdes `wounded` im Sammelfoto sperrt
-- weiter (Codex V2 DB-P7).
create or replace function public.foto_zeigt_verborgene_nachsuche(p_kill_ids uuid[])
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.kills k
     where k.id = any (p_kill_ids)
       and k.hunt_id in (select public.get_my_teilnahme_hunt_ids())
       and k.status = 'wounded'::kill_status
       and k.reporter_id is distinct from auth.uid()
       and not coalesce(k.participant_id in (select public.meine_angenommenen_teilnahmen()), false)
       and public.sicht_stufe(k.hunt_id) <> 'leitung');
$$;

-- Der Erleger liest den Namen der Art seines Stuecks -- ueber denselben
-- Helfer, sonst laese ein nur Eingeladener eine private Art (Fable F14).
-- ⚠ Dieselben vier Zweige stehen in `erlegung_kontrollieren` (Artwechsel,
-- E-B6) -- die RPC ist DEFINER und kann die Policy nicht fragen.
alter policy wildarten_select on public.wildarten
  using ((besitzer_id is null)
         or (besitzer_id = auth.uid())
         or (exists (select 1 from public.kills k
                      where k.wildart_id = wildarten.id
                        and k.reporter_id = auth.uid()))
         or (exists (select 1 from public.kills k
                      where k.wildart_id = wildarten.id
                        and k.participant_id in (select public.meine_angenommenen_teilnahmen()))));

-- ---------------------------------------------------------------------------
-- 17. Rechte (AGENTS.md: REVOKE namentlich, nicht nur FROM PUBLIC)
-- ---------------------------------------------------------------------------
-- Ersetzte Funktionen (`create or replace`) behalten ihre ACL.

revoke execute on function
  public.teilnahme_annahme_nur_selbst(),
  public.stand_ort_im_treiben(uuid, uuid),
  public.sitz_ort_der_jagd(uuid),
  public.kill_kontrolle_schutz(),
  public.kill_stand(public.kills),
  public.kill_verlauf_schreiben(),
  public.meldung_in_sicht(uuid, extensions.geometry, uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.kontroll_stufe(uuid),
  public.erlegung_kontrollieren(uuid, text, jsonb, jsonb, text),
  public.gast_aufnehmen(uuid, uuid, text),
  public.meine_angenommenen_teilnahmen()
  from public, anon, service_role;

grant execute on function
  public.kontroll_stufe(uuid),
  public.erlegung_kontrollieren(uuid, text, jsonb, jsonb, text),
  public.gast_aufnehmen(uuid, uuid, text),
  public.meine_angenommenen_teilnahmen()
  to authenticated;

comment on function public.kontroll_stufe(uuid) is
  '152: leitung (Ersteller, Revierbesitzer, joined Jagdleiter) | gruppenleiter (joined, Tag) | null. Recht fuer Eintragen, Kontrolle, Loeschsperre, Gast (E-B2).';
comment on function public.erlegung_kontrollieren(uuid, text, jsonb, jsonb, text) is
  '152: Kontrolle einer Erlegung (E-B6). Reihenfolge Recht -> Ist=Ziel -> Ist<>erwartet -> Tabelle; CAS ueber Felder und Kontrollspalten.';
comment on function public.gast_aufnehmen(uuid, uuid, text) is
  '152: spontaner Gast (E-B14), Kennung vom Geraet, idempotent je Jagd.';

commit;
