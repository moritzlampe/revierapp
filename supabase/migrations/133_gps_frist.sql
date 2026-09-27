-- 133: GPS-Spuren — Frist fuer fremde Wege, "Jagd sichern" (CN-239).
--
-- ANLASS: bis hierher liest jedes beigetretene Mitglied per REST JEDE Spur
-- der Jagd, fuer immer (`positions_hunt_member`); "teilt nicht" und "anonym"
-- gab es nur im Client (`darfWegSehen`). Go-Live-Checkliste D3/D4.
-- Bauplan (F14 geprueft, Entscheidungen Moritz 26./27.09.2026):
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_GPS_Frist_V1.md
-- Begruendung und Pruefkette:
-- quickhunt-native/docs/migrationen/133_gps_frist.md
--
--
-- DIE REGEL IN VIER SAETZEN
--
-- 1. Den EIGENEN Weg sieht man immer (solange das Konto besteht).
-- 2. Einen FREMDEN Weg (`positions`) sehen die `joined`-Teilnehmer der Jagd
--    — solange sie laeuft, danach bis zur Frist, die der BESITZER des Weges
--    in `user_settings.weg_frist` gewaehlt hat (Standard: Ende des
--    folgenden Jagdjahres). Gesichert (`hunts.gesichert_am`) = keine Frist.
--    Auf der Drueckjagd nur die Wege der Treiber — fuer alle, auch den
--    Jagdleiter. `none` sperrt fuer alle, `anon` fuer alle ausser dem
--    `joined`-Jagdleiter (zeichengleich zu `darfWegSehen`).
-- 3. Einen FREMDEN Live-Punkt (`positions_current`) sehen die `joined`-
--    Teilnehmer nur, solange die Jagd `active` oder `paused` ist (wie die
--    native Karte seit CN-194, `zeigtFremdeLiveStandorte`). `none` sperrt.
--    Keine Drueckjagd-Regel: der Live-Punkt ist dort das Sicherheitsbild.
-- 4. Eine gesicherte (beendete) Jagd haelt ihre Wege fest: der Besitzer kann
--    sie nicht loeschen, die Jagd und ihre Teilnehmerzeilen lassen sich nicht
--    loeschen, `konto_loeschen()` behaelt sie — sofern an der Jagd ANDERE
--    beteiligt sind; eine eigene Jagd ohne Fremdes geht in §3/3/§3/4 samt
--    Wegen (Bauplan E11). Aufheben nimmt die Wege geloeschter Konten mit
--    (sonst laegen sie ohne Konto fuer immer da).
--
--
-- WAS DIESE DATEI ANLEGT ODER AENDERT
--
--   user_settings.weg_frist           die Frist je Nutzer (Spalte auf der
--                                     bestehenden Tabelle, Bauplan E4)
--   hunts.gesichert_am                null = nicht gesichert (E8)
--   weg_frist_ende()                  Kalenderrechnung in Berliner Zeit (E3)
--   weg_sichtbare_teilnahmen()        Helfer fuer die Policy auf positions
--   live_sichtbare_teilnahmen()       Helfer fuer die Policy auf positions_current
--   meine_gesicherten_teilnahmen()    Helfer fuer die Loeschsperre (E9)
--   jagd_sichern()                    RPC (E8)
--   jagd_sicherung_aufheben()         RPC mit Compare-and-Swap (E8)
--   trg_hunts_gesichert_fest          gesichert_am nur per RPC (E8)
--   trg_hunts_gesichert_loeschsperre, trg_teilnehmer_gesichert_loeschsperre
--                                     keine Loeschung einer gesicherten Jagd
--                                     aus dem Client (E9, Moritz: "ja, sperren")
--   trg_teilnehmer_jagd_fest          `hunt_participants.hunt_id` fuer Clients
--                                     fest — sonst umgehbar (Codex 133, 14)
--   positions_sichtbar, positions_current_sichtbar   ersetzen *_hunt_member
--   positions_delete_own              + Sperre in gesicherter Jagd
--   konto_loeschen()                  §3/10: eigene Wege gehen mit (E11)
--
--
-- WER DARF WAS
--
-- Die drei Helfer: EXECUTE nur `authenticated` — sie stehen in Policies,
-- die `to authenticated` gelten (078-Regel: eine Policy, die eine Funktion
-- ruft, gaebe `anon` sonst 42501). Sie liefern nur Teilnehmer-IDs, die der
-- Aufrufer ueber `hunt_participants` ohnehin sieht, bzw. nur EIGENE — kein
-- Orakel.
-- `weg_frist_ende`: EXECUTE fuer NIEMANDEN; sie laeuft nur im Helfer als
-- dessen Besitzer.
-- Die zwei RPCs: `authenticated`; Recht = Ersteller ODER `joined`-
-- Jagdleiter (gleich `istJagdleiter` im nativen Client und den UPDATE-
-- Policies auf `hunts`).
-- Die Triggerfunktionen: EXECUTE fuer niemanden (082). Sie laufen als
-- INVOKER, weil sie an `current_user` erkennen, ob ein Client schreibt
-- (Bauform 085 `kontakt_feste_spalten`) — in einer DEFINER-Funktion waere
-- `current_user` immer der Besitzer.
-- `pg_temp` am ENDE jedes search_path (076). REVOKE namentlich (081).
--
--
-- ⚠ FALLEN
--
-- 1. `user_settings.weg_frist` wertet eine Policy aus (ueber den Helfer) —
--    das verbietet 101 eigentlich. Hier nicht, weil der Nutzer damit nur
--    kuerzen kann, wie lange ANDERE SEINE Daten sehen; der groesste Wert ist
--    der Standard. **Wer der Tabelle eine Einstellung hinzufuegt, die
--    jemandem MEHR Rechte gibt, faellt wieder unter 101.**
-- 2. Die Loeschsperre ist nur so stark wie `current_user`: RPCs als
--    Besitzer (`konto_loeschen`, `teilnehmer_entfernen`, die RPCs hier)
--    kommen durch — gewollt. Eine CASCADE aus `hunts` laeuft als Besitzer
--    von `hunt_participants` und kaeme auch durch; sie wird vorher vom
--    Trigger auf `hunts` aufgehalten.
-- 3. Der Anker der Frist ist `hunts.ended_at` — Geraetezeit, fuer Ersteller
--    und Jagdleiter per REST schreibbar (Bauplan E2). Keine neue Macht: sie
--    duerfen ohnehin sichern. Beendete Jagd ohne `ended_at` (heute 0) nimmt
--    `last_activity_at`.
-- 4. Fristablauf erzeugt KEIN Realtime-Ereignis; ein offener Weg bleibt bis
--    zum Neuladen stehen (Bauplan E12 schliesst ihn nativ beim Jagdende).
-- 5. `konto_loeschen()` wird aus dem KATALOGtext vom 27.09.2026 neu
--    geschrieben, nicht aus 132_konto_loeschen.sql (Katalog normalisiert).
--    Einzige Aenderung: der Block §3/9–§3/10.
--
--
-- BEWUSST HINGENOMMEN UND BENANNT
--
-- `position_consent` und `role` sind fuer den Jagdleiter per REST
-- schreibbar (CN-198) — er kann `none` auf `name` drehen und den Weg lesen.
-- Ebenso `hunts.type`: eine Drueckjagd auf 'ansitz' umgestellt, und die
-- Treiber-Regel faellt (Bauplan E5 — eine Relevanz-, keine Schutzregel).
-- `revier_praesenz()` (DEFINER) gibt dem Revierinhaber den Live-Punkt aktiver
-- Solojagden ueber `revier_sichtbarkeit`, ohne `position_consent` — heute
-- setzt kein Client `none` auf einer Solojagd.
-- Die PWA maskiert `anon` auf der Live-Ebene nicht (Anzeige, nicht Recht).
-- Alte native Builds melden beim Widerruf in einer gesicherten Jagd einen
-- Loeschfehler (Bauplan E9).
-- Ein Zweitgeraet eines Geloeschten kann bis zum Tokenablauf (<= 1 h) noch
-- Positionen schreiben — in Jagden, in denen er `joined` bleibt: laufende
-- und geplante setzt `konto_loeschen()` auf `left`, BEENDETE nicht (Codex
-- 133, Punkt 11; der 132-Kopf sagte „Positionen nicht mehr" und stimmte fuer
-- beendete Jagden nie). Die Zeilen blieben nach dem einmaligen DELETE liegen.
-- Kein Client schreibt Positionen in eine beendete Jagd; es braucht REST und
-- ein altes Token. Unter E16 (132, Moritz: hinnehmen und benennen).
-- Die PWA loescht eine gesicherte Jagd nicht mehr — und zeigt dabei KEINEN
-- Hinweis (`home-content.tsx:364` behandelt nur `!error`; Codex 133, 12).
-- `positions.hunt_id` ist gegen `hunt_participants.hunt_id` nicht
-- abgeglichen (`positions_insert_own` prueft nur die Teilnahme) —
-- vorbestehend; die Sichtbarkeit haengt an `participant_id` und erbt das
-- nicht.
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 133_gps_frist.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build applizieren: der Client selektiert
-- `hunts.gesichert_am` und `user_settings.weg_frist`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Spalten
-- ---------------------------------------------------------------------------

alter table public.user_settings
  add column weg_frist text not null default 'folgejagdjahr'
    constraint user_settings_weg_frist_check
    check (weg_frist in ('jagd', '30_tage', '6_monate', 'folgejagdjahr'));

comment on column public.user_settings.weg_frist is
  'CN-239 (133): wie lange ANDERE den eigenen Weg nach Jagdende sehen. '
  'jagd = nur waehrend der Jagd; 30_tage; 6_monate; folgejagdjahr = bis '
  'Ende des folgenden Jagdjahres (Standard, auch ohne Zeile). Kalenderfrist '
  'in Europe/Berlin. Darf nur KUERZEN (101-Regel, Kopf von 133).';

alter table public.hunts
  add column gesichert_am timestamptz;

comment on column public.hunts.gesichert_am is
  'CN-239 (133): null = nicht gesichert. Gesetzt: keine Frist fuer die Wege '
  'dieser Jagd, konto_loeschen() behaelt sie, Jagd und Teilnehmerzeilen '
  'sind aus dem Client nicht loeschbar. NUR ueber jagd_sichern() / '
  'jagd_sicherung_aufheben() (trg_hunts_gesichert_fest).';

-- ---------------------------------------------------------------------------
-- 2. Fristrechnung (Bauplan E3)
-- ---------------------------------------------------------------------------
-- Jagdjahr 01.04.–31.03. (§ 11 Abs. 4 BJagdG). "folgejagdjahr": das Jagdjahr
-- des Jagdendes bestimmen (Berliner Ortsdatum), zwei weiter, 01.04. 00:00
-- Berlin. 30 Tage / 6 Monate als KALENDERfrist in Berliner Zeit — eine
-- nackte timestamptz-Addition hinge an der Sitzungszeitzone (Codex 4).
-- Unbekannte Stufe -> null -> `now() < null` ist nicht wahr -> nicht
-- sichtbar. Der CHECK laesst keine zu; faellt er je weg, schliesst es.

create function public.weg_frist_ende(p_ende timestamptz, p_stufe text)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    -- ⛔ Nicht-endlicher Anker ZUERST (Schlusslesung 133, F1 [mittel]):
    -- `ended_at`/`last_activity_at` tragen keinen CHECK, ein Jagdleiter kann
    -- per REST 'infinity' schreiben. Im Zweig 'folgejagdjahr' wuerfe
    -- `extract(year …)::int` dann 0A000 — INNERHALB des Helfers, und jede
    -- Leseanfrage auf `positions` aller Teilnehmer dieser Jagd scheiterte, auch
    -- auf die eigenen Wege in anderen Jagden. So verhaelt es sich wie jede
    -- andere Zukunft (E2: der Leiter darf ohnehin sichern); -infinity sperrt.
    when p_stufe in ('jagd', '30_tage', '6_monate', 'folgejagdjahr')
         and not isfinite(p_ende) then p_ende
    when p_stufe = 'jagd'     then p_ende
    when p_stufe = '30_tage'  then ((p_ende at time zone 'Europe/Berlin') + interval '30 days')
                                     at time zone 'Europe/Berlin'
    when p_stufe = '6_monate' then ((p_ende at time zone 'Europe/Berlin') + interval '6 months')
                                     at time zone 'Europe/Berlin'
    when p_stufe = 'folgejagdjahr' then make_timestamptz(
        extract(year from (p_ende at time zone 'Europe/Berlin'))::int
          - case when extract(month from (p_ende at time zone 'Europe/Berlin')) < 4
                 then 1 else 0 end
          + 2,
        4, 1, 0, 0, 0, 'Europe/Berlin')
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. Helfer fuer die Policies
-- ---------------------------------------------------------------------------
-- "Laeuft" heisst fuer den Weg: noch nicht beendet. Der Frist-Anker ist
-- `ended_at`; eine beendete Jagd ohne ihn (heute 0) nimmt
-- `last_activity_at` (NOT NULL) — sonst waere sie fuer immer offen.

create function public.weg_sichtbare_teilnahmen()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hp.id
    from hunt_participants hp
   where hp.user_id = auth.uid()
  union
  select hp.id
    from hunt_participants hp
    join hunts h on h.id = hp.hunt_id
    left join user_settings us on us.user_id = hp.user_id
   where hp.hunt_id in (select m.hunt_id from hunt_participants m
                         where m.user_id = auth.uid() and m.status = 'joined')
     and hp.position_consent is distinct from 'none'
     and (hp.position_consent is distinct from 'anon'
          or exists (select 1 from hunt_participants l
                      where l.hunt_id = hp.hunt_id
                        and l.user_id = auth.uid()
                        and l.status  = 'joined'
                        and l.role    = 'jagdleiter'))
     and (h.type is distinct from 'drueckjagd' or hp.role = 'treiber')
     and (   h.status not in ('completed', 'auto_completed')
          or h.gesichert_am is not null
          or now() < weg_frist_ende(coalesce(h.ended_at, h.last_activity_at),
                                    coalesce(us.weg_frist, 'folgejagdjahr')))
$$;

create function public.live_sichtbare_teilnahmen()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hp.id
    from hunt_participants hp
   where hp.user_id = auth.uid()
  union
  select hp.id
    from hunt_participants hp
    join hunts h on h.id = hp.hunt_id
   where hp.hunt_id in (select m.hunt_id from hunt_participants m
                         where m.user_id = auth.uid() and m.status = 'joined')
     and hp.position_consent is distinct from 'none'
     and h.status in ('active', 'paused')
$$;

-- Nur EIGENE Teilnahmen — die Loeschsperre darf nicht unter RLS pruefen:
-- ein entfernter Teilnehmer sieht den Jagdkopf nicht mehr, ein
-- `not exists (… from hunts …)` waere fuer ihn wahr (Codex S3).
create function public.meine_gesicherten_teilnahmen()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hp.id
    from hunt_participants hp
    join hunts h on h.id = hp.hunt_id
   where hp.user_id = auth.uid()
     and h.gesichert_am is not null
$$;

-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------

drop policy positions_hunt_member on public.positions;
create policy positions_sichtbar on public.positions
  for select to authenticated
  using (participant_id in (select weg_sichtbare_teilnahmen()));
comment on policy positions_sichtbar on public.positions is
  'CN-239 (133): eigener Weg immer; fremd nach Frist, Consent, Drueckjagd '
  'nur Treiber. Regel: weg_sichtbare_teilnahmen().';

drop policy positions_current_hunt_member on public.positions_current;
create policy positions_current_sichtbar on public.positions_current
  for select to authenticated
  using (participant_id in (select live_sichtbare_teilnahmen()));
comment on policy positions_current_sichtbar on public.positions_current is
  'CN-239 (133): eigener Punkt immer; fremd nur waehrend active/paused und '
  'ohne none (wie CN-194). Regel: live_sichtbare_teilnahmen().';

-- Ausdruck unveraendert bis auf die Sperre; `to authenticated`, weil er
-- jetzt eine Funktion ruft (078).
alter policy positions_delete_own on public.positions
  to authenticated
  using (
    participant_id in (select hunt_participants.id
                         from hunt_participants
                        where hunt_participants.user_id = auth.uid())
    and participant_id not in (select meine_gesicherten_teilnahmen())
  );

-- ---------------------------------------------------------------------------
-- 5. Sichern / Aufheben (Bauplan E8)
-- ---------------------------------------------------------------------------

create function public.jagd_sichern(p_hunt uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creator uuid;
  v_status  hunt_status;
  v_am      timestamptz;
begin
  select h.creator_id, h.status into v_creator, v_status from hunts h where h.id = p_hunt;
  if not found then
    raise exception 'Jagd nicht gefunden' using errcode = '42704';
  end if;

  if not (
    v_creator = auth.uid()
    or exists (select 1 from hunt_participants p
                where p.hunt_id = p_hunt
                  and p.user_id = auth.uid()
                  and p.status  = 'joined'
                  and p.role    = 'jagdleiter')
  ) then
    raise exception 'Nur der Ersteller oder ein Jagdleiter dieser Jagd darf sichern'
      using errcode = '42501';
  end if;

  -- Nur BEENDETE Jagden (Bauplan E8; Schlusslesung 133, F2). Erst dann laeuft
  -- eine Frist, und nur dort gilt, was §3/10 in konto_loeschen() und die
  -- FOR-SHARE-Sperre voraussetzen: kein Positionsstrom auf die Jagdzeile,
  -- keine Teilnehmerzeile, die §3/5 samt Wegen loeschen darf (draft/
  -- scheduled). Der Client bietet den Knopf nur dort an; REST sonst nicht.
  if v_status is distinct from 'completed' and v_status is distinct from 'auto_completed' then
    raise exception 'Nur eine beendete Jagd laesst sich sichern'
      using errcode = '55000';
  end if;

  -- Idempotent: schon gesichert -> der erste Zeitpunkt bleibt.
  -- Die Statusbedingung steht AUCH im UPDATE (Delta-Schlusslesung 133,
  -- D2-a): die Pruefung oben ist check-then-act, ein REST-`status` dazwischen
  -- ergaebe sonst eine gesicherte laufende Jagd. Null Zeilen -> Fehler unten.
  update hunts h
     set gesichert_am = coalesce(h.gesichert_am, now())
   where h.id = p_hunt
     and h.status in ('completed', 'auto_completed')
  returning h.gesichert_am into v_am;

  -- Zwischen Pruefung und UPDATE geloescht -> null Zeilen; nie ein stilles
  -- `null` als Antwort (Codex 133, 10/S1).
  if v_am is null then
    raise exception 'Jagd nicht gefunden' using errcode = '42704';
  end if;

  return v_am;
end;
$$;

-- p_gesehen: der Wert, den der Aufrufer angezeigt bekam. Hat ihn inzwischen
-- jemand geaendert (erneut gesichert), wird nichts aufgehoben (Codex S6).
create function public.jagd_sicherung_aufheben(p_hunt uuid, p_gesehen timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creator uuid;
  betroffen int;
begin
  if p_gesehen is null then
    raise exception 'p_gesehen ist Pflicht' using errcode = '22004';
  end if;

  select h.creator_id into v_creator from hunts h where h.id = p_hunt;
  if not found then
    raise exception 'Jagd nicht gefunden' using errcode = '42704';
  end if;

  if not (
    v_creator = auth.uid()
    or exists (select 1 from hunt_participants p
                where p.hunt_id = p_hunt
                  and p.user_id = auth.uid()
                  and p.status  = 'joined'
                  and p.role    = 'jagdleiter')
  ) then
    raise exception 'Nur der Ersteller oder ein Jagdleiter dieser Jagd darf die Sicherung aufheben'
      using errcode = '42501';
  end if;

  update hunts h
     set gesichert_am = null
   where h.id = p_hunt
     and h.gesichert_am = p_gesehen;

  get diagnostics betroffen = row_count;
  if betroffen <> 1 then
    raise exception 'Die Sicherung wurde inzwischen geaendert'
      using errcode = '55000';
  end if;

  -- Wege geloeschter Konten lagen nur wegen der Sicherung noch hier
  -- (konto_loeschen §3/10). Ohne Sicherung haben sie keinen Zweck mehr —
  -- und die Einstellung ihres Besitzers ist mit dem Konto weg, der Standard
  -- gaebe sie wieder frei (Codex 17).
  delete from positions p
   using hunt_participants hp
   where p.participant_id = hp.id
     and hp.hunt_id = p_hunt
     and exists (select 1 from konto_loeschungen k where k.user_id = hp.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Trigger (INVOKER — sie lesen `current_user`)
-- ---------------------------------------------------------------------------

create function public.hunts_gesichert_nur_per_rpc()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.gesichert_am is not null then
      raise exception 'gesichert_am wird nur ueber jagd_sichern() gesetzt'
        using errcode = '42501';
    end if;
  elsif new.gesichert_am is distinct from old.gesichert_am then
    raise exception 'gesichert_am wird nur ueber jagd_sichern() / jagd_sicherung_aufheben() geaendert'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_hunts_gesichert_fest
  before insert or update of gesichert_am on public.hunts
  for each row execute function public.hunts_gesichert_nur_per_rpc();

-- Fuer `hunt_participants` liest die Funktion `hunts` unter RLS. Loeschen
-- duerfen dort nur Ersteller (`participants_creator_all`) und `joined`-
-- Jagdleiter (`participants_leader_all`) — beide sehen die Jagd.
create function public.gesicherte_jagd_nicht_loeschen()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_am timestamptz;
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;

  if tg_table_name = 'hunts' then
    v_am := old.gesichert_am;
  else
    select h.gesichert_am into v_am from hunts h where h.id = old.hunt_id;
    -- Fail-closed (Schlusslesung 133, F3): sieht der Loeschende die Jagd
    -- nicht, ist das keine Auskunft "nicht gesichert". Heute unerreichbar —
    -- aendert je jemand die SELECT-Policies auf `hunts`, oeffnete der Riegel
    -- sonst still.
    if not found then
      raise exception 'Jagd nicht sichtbar' using errcode = '42501';
    end if;
  end if;

  if v_am is not null then
    raise exception 'Diese Jagd ist gesichert — erst die Sicherung aufheben'
      using errcode = '55006';
  end if;

  return old;
end;
$$;

create trigger trg_hunts_gesichert_loeschsperre
  before delete on public.hunts
  for each row execute function public.gesicherte_jagd_nicht_loeschen();

create trigger trg_teilnehmer_gesichert_loeschsperre
  before delete on public.hunt_participants
  for each row execute function public.gesicherte_jagd_nicht_loeschen();

-- Die Loeschsperre haengt an `hunt_participants.hunt_id` — und die war fuer
-- Ersteller und Jagdleiter per REST schreibbar. Wer beide Jagden leitet,
-- haengt eine Teilnahme aus der gesicherten Jagd A in die ungesicherte B um,
-- loescht sie dort, und die CASCADE nimmt die Wege aus A mit (Codex 133,
-- Punkt 14). Kein Client aendert `hunt_id` einer Teilnahme (gemessen
-- 27.09.2026: nativ `participants.ts`, PWA `hunt/[id]/page.tsx`, Portal
-- `jagden/[id]/detail.tsx` — nur status/role/tags/Gastfelder). Bauform 085.
create function public.teilnahme_jagd_fest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.hunt_id is distinct from old.hunt_id then
    raise exception 'Die Jagd einer Teilnahme ist fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_teilnehmer_jagd_fest
  before update of hunt_id on public.hunt_participants
  for each row execute function public.teilnahme_jagd_fest();

-- ---------------------------------------------------------------------------
-- 7. konto_loeschen() — §3/10 (Bauplan E11)
-- ---------------------------------------------------------------------------
-- Aus dem Katalogtext vom 27.09.2026. Einzige Aenderung: der Block §3/9–§3/10
-- (vorher: "positions bleiben bis CN-239").
-- Eigene Jagden OHNE Fremdes gehen schon in §3/3/§3/4 samt ihren Wegen per
-- CASCADE — gesichert oder nicht: an ihnen ist niemand sonst beteiligt
-- (Bauplan E11, Codex 10 / SL F10).

create or replace function public.konto_loeschen(p_uid uuid, p_fotos_behalten boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_behalten   boolean;
  v_pruefung   jsonb;
  v_reviere    uuid[];
  v_jagden     uuid[];
  v_teilnahmen uuid[];
  v_dateien    jsonb;
  betroffen    int;
begin
  if p_uid is null or p_fotos_behalten is null then
    raise exception 'konto_loeschen: beide Argumente sind Pflicht';
  end if;

  -- §3/1 Status anlegen und sperren. Ein zweites Geraet wartet hier, bis das
  -- erste fertig ist, und laeuft dann die Liste noch einmal — idempotent.
  -- Die Foto-Wahl gilt ab dem ERSTEN Aufruf.
  insert into konto_loeschungen (user_id, fotos_behalten)
  values (p_uid, p_fotos_behalten)
  on conflict (user_id) do nothing;

  select k.fotos_behalten into v_behalten
    from konto_loeschungen k
   where k.user_id = p_uid
     for update;

  -- §3/9 vorgezogen (Schlusslesung 132, F2): die eigene Live-Position ZUERST.
  -- Sendet das Geraet des Loeschenden noch, haelt sein Upsert die Zeile und
  -- will per `update_hunt_last_activity` auf `hunts` schreiben — das
  -- FOR UPDATE unten stuende dagegen, und die spaetere Loeschung derselben
  -- Zeile schloesse den Kreis zum Deadlock. Unten laeuft sie noch einmal.
  -- Davor die eigenen Teilnehmerzeilen (Delta-Schlusslesung 132, F-A): so
  -- sperrt diese Funktion in derselben Reihenfolge wie teilnehmer_entfernen()
  -- (128) — Teilnehmer, dann Position. NO KEY UPDATE vertraegt sich mit dem
  -- KEY SHARE, den ein Positions-Insert per Fremdschluessel nimmt.
  perform 1 from hunt_participants p where p.user_id = p_uid for no key update;
  delete from positions_current c
   where c.participant_id in (select p.id from hunt_participants p where p.user_id = p_uid);

  -- Eltern sperren, BEVOR geprueft wird (Fremdpruefung 132, F7). Ohne das
  -- koennte ein fremder Beitritt, eine fremde Erlegung oder Standpruefung
  -- zwischen Pruefung und Loeschung committen und per CASCADE mitgehen.
  -- Jede solche Zeile nimmt beim Anlegen FOR KEY SHARE auf ihre Elternzeile,
  -- und das steht gegen FOR UPDATE: sie wartet hier. Danach ist entweder
  -- ihre Zeile committet und die Pruefung unten sieht sie (READ COMMITTED,
  -- neuer Schnappschuss je Anweisung), oder die Eltern sind nach unserem
  -- COMMIT weg und ihr INSERT scheitert laut an 23503.
  perform 1 from districts d where d.owner_id = p_uid for update;
  perform 1 from hunts h
   where h.creator_id = p_uid
      or h.district_id in (select d.id from districts d where d.owner_id = p_uid)
     for update;
  perform 1 from map_objects o
   where o.district_id in (select d.id from districts d where d.owner_id = p_uid)
     for update;
  perform 1 from chat_groups g
   where g.hunt_id in (select h.id from hunts h
                        where h.creator_id = p_uid
                           or h.district_id in (select d.id from districts d
                                                 where d.owner_id = p_uid))
     for update;

  -- Vorbedingungen. Schlagen sie an, rollt auch die Statuszeile zurueck.
  v_pruefung := konto_loeschung_pruefen(p_uid);
  if not (v_pruefung ->> 'moeglich')::boolean then
    raise exception 'Konto-Loeschung nicht moeglich'
      using errcode = 'P0001', detail = v_pruefung::text;
  end if;

  -- §3/2 Laufende eigene Jagden ohne weiteren Jagdleiter beenden (M5).
  -- close_drives_on_hunt_end und clear_stand_bezug_on_hunt_end raeumen.
  update hunts h
     set status   = 'completed',
         ended_at = coalesce(h.ended_at, now())
   where h.creator_id = p_uid
     and h.status in ('active', 'paused')
     and not exists (select 1 from hunt_participants x
                      where x.hunt_id = h.id
                        and x.role    = 'jagdleiter'
                        and x.status  = 'joined'
                        and x.user_id <> p_uid);

  -- §3/3 Eigene Reviere — nach V1 haengt an keinem mehr etwas Fremdes.
  -- Reihenfolge zwingend: kills.hunt_id und hunts.district_id sind NO ACTION.
  select coalesce(array_agg(d.id), '{}') into v_reviere
    from districts d where d.owner_id = p_uid;
  select coalesce(array_agg(h.id), '{}') into v_jagden
    from hunts h where h.district_id = any (v_reviere);

  delete from wild_events w where w.hunt_id = any (v_jagden) and w.type <> 'kill';
  delete from kills k
   where k.district_id = any (v_reviere) or k.hunt_id = any (v_jagden);
  delete from hunts h where h.id = any (v_jagden);
  -- CASCADE: Zonen, Kartenobjekte (Pruefungen, Fotos, Standgruppen-Staende),
  -- Standgruppen, Abschussplaene, Scheine samt Zahlungen.
  delete from districts d where d.id = any (v_reviere);

  -- §3/4 Private Jagden: eigene, ohne Revier, ohne irgendetwas Fremdes.
  -- VOR §3/7, sonst wuerden ihre Anblicke per SET NULL zu Waisen (SL F5).
  select coalesce(array_agg(h.id), '{}') into v_jagden
    from hunts h
   where h.creator_id = p_uid
     and h.district_id is null
     and not jagd_hat_fremde_daten(h.id, p_uid);

  delete from wild_events w where w.hunt_id = any (v_jagden) and w.type <> 'kill';
  delete from kills k where k.hunt_id = any (v_jagden);
  delete from hunts h where h.id = any (v_jagden);

  -- §3/5 Teilnahmen in bleibenden Jagden. Das Aufraeumen folgt
  -- teilnehmer_entfernen() (128) — Falle 3 im Kopf. Beendete Jagden bleiben
  -- unangetastet: dort ist die Zuteilung Protokoll ("wer war wo").
  -- ⚠ hunt_seat_assignments bleiben, ANDERS als in 128 (Fremdpruefung 132,
  -- F6): hunt_drive_stands.seat_assignment_id ist CASCADE, ein Loeschen nahme
  -- die Standzuordnungen auch ABGESCHLOSSENER Treiben mit. Der Einlock-
  -- Zustand (hunt_stand_bezug) geht trotzdem; die Karte zeigt den Stand frei.
  select coalesce(array_agg(p.id), '{}') into v_teilnahmen
    from hunt_participants p where p.user_id = p_uid;

  delete from hunt_stand_bezug b where b.participant_id = any (v_teilnahmen);

  update hunt_drive_stands s
     set participant_id = null
   where s.participant_id = any (v_teilnahmen)
     and s.drive_id in (select d.id from hunt_drives d where d.status <> 'completed');

  -- geplant und von nichts referenziert -> weg
  delete from hunt_participants p
   using hunts h
   where p.hunt_id = h.id
     and p.user_id = p_uid
     and h.status in ('draft', 'scheduled')
     and not exists (select 1 from kills k where k.participant_id = p.id)
     and not exists (select 1 from messages m where m.participant_id = p.id)
     and not exists (select 1 from tracking_requests t
                      where t.handler_participant_id = p.id);

  -- laufend, oder geplant und referenziert -> left (ohne entfernt_am)
  update hunt_participants p
     set status  = 'left',
         left_at = coalesce(p.left_at, now())
    from hunts h
   where p.hunt_id = h.id
     and p.user_id = p_uid
     and h.status in ('active', 'paused', 'draft', 'scheduled')
     and p.status is distinct from 'left';

  -- §3/7 Private Wildereignisse ohne Jagd. §3/8: mit Jagd bleiben sie
  -- (Jagdprotokoll). Falle 1 im Kopf: NIE type = 'kill'.
  delete from wild_events w
   where w.user_id = p_uid and w.hunt_id is null and w.type <> 'kill';

  -- §3/9 Live-Position.
  delete from positions_current c where c.participant_id = any (v_teilnahmen);

  -- §3/10 Wege (133, CN-239): die eigenen gehen mit — ausser in gesicherten
  -- Jagden (Unfall, Streit, Nachsuche). Hebt der Jagdleiter die Sicherung
  -- spaeter auf, nimmt jagd_sicherung_aufheben() sie nach.
  -- Pfad ueber positions_participant_id_idx (132); `positions` traegt keinen
  -- Trigger.
  --
  -- ⛔ ERST die gesicherten Jagden dieses Kontos FOR SHARE sperren (Codex 133,
  -- Punkt 5 [hoch]). Sonst hebt ein Jagdleiter gleichzeitig auf, sieht die
  -- noch uncommittete Zeile in konto_loeschungen nicht und raeumt die Wege
  -- nicht ab, waehrend diese Funktion sie wegen der Sicherung behaelt —
  -- beide committen, die Wege bleiben ohne Konto UND ohne Sicherung liegen.
  -- FOR SHARE steht gegen das UPDATE in jagd_sicherung_aufheben (NO KEY
  -- UPDATE): kommt das Aufheben zuerst, wartet diese Zeile und liest danach
  -- gesichert_am = null (READ COMMITTED prueft die neue Version) -> die
  -- Wege gehen unten mit. Kommt diese Zeile zuerst, wartet das Aufheben, und
  -- sein DELETE (neue Anweisung, neuer Schnappschuss) sieht die committete
  -- konto_loeschungen-Zeile. Das Aufheben haelt vorher kein Schloss, auf das
  -- diese Funktion wartet — kein Kreis.
  -- Nur GESICHERTE Jagden: beendet, also ohne Positionsstrom, der ueber
  -- update_hunt_last_activity auf dieselbe Zeile schriebe.
  perform 1 from hunts h
   where h.gesichert_am is not null
     and h.id in (select p.hunt_id from hunt_participants p where p.user_id = p_uid)
     for share;

  -- ⚠ Die Jagd kommt aus der TEILNAHME, nicht aus `positions.hunt_id` —
  -- dieselbe Achse wie Policy und Aufheben (Schlusslesung 133, F5):
  -- `positions.hunt_id` waehlt der Client frei, und eine Zeile mit fremder
  -- `hunt_id` bliebe hier sonst behalten und beim Aufheben unauffindbar.
  delete from positions p
   where p.participant_id = any (v_teilnahmen)
     and not exists (select 1 from hunt_participants hp
                       join hunts h on h.id = hp.hunt_id
                      where hp.id = p.participant_id
                        and h.gesichert_am is not null);

  -- §3/11 Chat-Text ersetzen (M2, E6). kill_report/signal/tracking bleiben.
  -- `participant_id` deckt Jagdchat-Zeilen ohne sender_id (120).
  update messages m
     set content   = 'Nachricht gelöscht',
         media_url = null,
         type      = 'text'
   where (m.sender_id = p_uid or m.participant_id = any (v_teilnahmen))
     and m.type in ('text', 'photo', 'audio')
     and (m.content is distinct from 'Nachricht gelöscht'
          or m.media_url is not null
          or m.type <> 'text');

  -- §3/13 Mitgliedschaften. §3/14: chat_groups.created_by bleibt (E7).
  delete from chat_group_members m where m.user_id = p_uid;

  -- §3/15 Scheine als Inhaber: entzogen, Textfelder bleiben (M7).
  update hunting_licenses l
     set status = 'entzogen'
   where l.holder_id = p_uid and l.status is distinct from 'entzogen';

  -- §3/16-17 Adressbuch — das eigene weg, in fremden nur der Kontobezug.
  delete from kontakt_mitfuehrende x
   where x.besitzer_id = p_uid or x.mitfuehrer_id = p_uid;
  delete from kontakte k where k.besitzer_id = p_uid;
  update kontakte k set profil_id = null where k.profil_id = p_uid;

  -- §3/18 Persoenliches ohne Bezug fuer andere. `user_settings` traegt seit
  -- 133 auch die Weg-Frist — sie geht mit (die Wege in gesicherten Jagden
  -- fallen danach unter den Standard, bleiben aber an die Sicherung gebunden).
  delete from jagdtag_notizen      where besitzer_id = p_uid;
  delete from feedback             where besitzer_id = p_uid;
  delete from push_subscriptions   where user_id     = p_uid;
  delete from user_settings        where user_id     = p_uid;
  delete from chat_stummschaltungen where besitzer_id = p_uid;

  -- §3/20 Private Wildarten, nur wenn nichts darauf zeigt (RESTRICT, 122).
  delete from wildarten w
   where w.besitzer_id = p_uid
     and not exists (select 1 from kills k where k.wildart_id = w.id)
     and not exists (select 1 from wild_events e where e.wildart_id = w.id)
     and not exists (select 1 from wildarten c where c.eltern_id = w.id);

  -- §3/19 + §3/22 Fotos (M6). Die Liste entsteht NACH den Loeschungen oben,
  -- weil "Gegenstand gibt es nicht mehr" eine der Bedingungen ist, und sie
  -- kommt aus storage.objects selbst: ein Wiederholungsaufruf nach einem
  -- Teilausfall findet die schon entfernten Dateien nicht mehr und zaehlt
  -- richtig (Bauplan §2 c).
  --   chat-photos    Klammer owner_id  -> immer
  --   group-avatars  Klammer owner_id  -> ohne Haekchen, oder Gruppe weg
  --   app-photos     Klammer 1. Pfadsegment (083; 185/210 ohne owner_id)
  --     kill|hunt|wild_event -> ohne Haekchen, oder wenn der Gegenstand weg ist
  --     map_object -> NUR wenn das Objekt weg ist (§3/3 nimmt die Objekte
  --                   eigener Reviere per CASCADE mit, die Dateien nicht);
  --                   an bleibenden Objekten bleiben sie immer (E9)
  --     Unbekanntes -> bleibt
  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)
                            order by o.bucket_id, o.name), '[]'::jsonb)
    into v_dateien
    from storage.objects o
   where (o.bucket_id = 'chat-photos' and o.owner_id = p_uid::text)
      -- Gruppenbilder: ohne Haekchen, oder wenn die Gruppe weg ist — etwa mit
      -- einer privaten Jagd (Fremdpruefung 132, F8). Pfad `<group_id>/…`.
      or (o.bucket_id = 'group-avatars' and o.owner_id = p_uid::text
          and (not v_behalten
               or not exists (select 1 from chat_groups g
                               where g.id::text = split_part(o.name, '/', 1))))
      or (o.bucket_id = 'app-photos'
          and split_part(o.name, '/', 1) = p_uid::text
          and case split_part(o.name, '/', 2)
                when 'kill' then not v_behalten
                  or not exists (select 1 from kills k
                                  where k.id::text = split_part(o.name, '/', 3))
                when 'hunt' then not v_behalten
                  or not exists (select 1 from hunts h
                                  where h.id::text = split_part(o.name, '/', 3))
                when 'wild_event' then not v_behalten
                  or not exists (select 1 from wild_events w
                                  where w.id::text = split_part(o.name, '/', 3))
                when 'map_object' then
                  not exists (select 1 from map_objects m
                               where m.id::text = split_part(o.name, '/', 3))
                else false
              end);

  -- Verweise auf diese Dateien in Zeilen, die bleiben (SL F9).
  update kills k set foto_url = null
    from jsonb_to_recordset(v_dateien) as d(bucket text, name text)
   where d.bucket = 'app-photos'
     and split_part(k.foto_url, '/app-photos/', 2) = d.name;

  update wild_events w set photo_url = null
    from jsonb_to_recordset(v_dateien) as d(bucket text, name text)
   where d.bucket = 'app-photos'
     and split_part(w.photo_url, '/app-photos/', 2) = d.name;

  -- Mit Haekchen stehen nur Dateien verschwundener Jagden in der Liste —
  -- deren Fotozeilen hat die CASCADE schon genommen.
  if not v_behalten then
    delete from hunt_photos p where p.uploaded_by = p_uid;
  end if;

  update chat_groups g set avatar_url = null
    from jsonb_to_recordset(v_dateien) as d(bucket text, name text)
   where d.bucket = 'group-avatars'
     and split_part(g.avatar_url, '/group-avatars/', 2) = d.name;

  -- §3/21 Grabstein. display_name und anonymize_kills bleiben.
  update profiles
     set phone               = null,
         jagdschein_nr       = null,
         waffe               = null,
         kaliber             = null,
         avatar_url          = null,
         wildart_favoriten   = '{}',
         availability_status = 'available'
   where id = p_uid;

  get diagnostics betroffen = row_count;
  if betroffen <> 1 then
    raise exception 'konto_loeschen: Profil % nicht gefunden', p_uid;
  end if;

  -- §3/22 Rueckgabe als EINE Zeile (returns table fiele unter max-rows, SL F7).
  return jsonb_build_object('dateien', v_dateien);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Rechte (081: namentlich; 082: Triggerfunktionen fuer niemanden)
-- ---------------------------------------------------------------------------

revoke execute on function public.weg_frist_ende(timestamptz, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.weg_sichtbare_teilnahmen()
  from public, anon, authenticated, service_role;
revoke execute on function public.live_sichtbare_teilnahmen()
  from public, anon, authenticated, service_role;
revoke execute on function public.meine_gesicherten_teilnahmen()
  from public, anon, authenticated, service_role;
grant execute on function public.weg_sichtbare_teilnahmen()     to authenticated;
grant execute on function public.live_sichtbare_teilnahmen()    to authenticated;
grant execute on function public.meine_gesicherten_teilnahmen() to authenticated;

revoke execute on function public.jagd_sichern(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.jagd_sicherung_aufheben(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.jagd_sichern(uuid)                          to authenticated;
grant execute on function public.jagd_sicherung_aufheben(uuid, timestamptz)  to authenticated;

revoke execute on function public.hunts_gesichert_nur_per_rpc()
  from public, anon, authenticated, service_role;
revoke execute on function public.gesicherte_jagd_nicht_loeschen()
  from public, anon, authenticated, service_role;
revoke execute on function public.teilnahme_jagd_fest()
  from public, anon, authenticated, service_role;

-- konto_loeschen: `create or replace` behaelt die Rechte aus 132 (nur
-- service_role) — kein erneutes grant/revoke. Gegenprobe nach dem
-- Applizieren: anon = false, authenticated = false, service_role = true.

commit;
