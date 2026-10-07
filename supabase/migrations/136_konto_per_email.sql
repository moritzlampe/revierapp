-- 136: Konto per E-Mail finden (CN-303) und den Einzelchat an genau
--      sein Paar binden (Befund B1 der Bauplan-Pruefung).
--
-- ANLASS: Moritz wollte einen Einzelchat mit jemandem starten, mit dem er
-- weder eine Jagd noch einen Chat teilt — die App bietet nur Bekannte an
-- (`fetchChatKandidaten`, Moritz 19.08.2026: "nur leute die ich kenne").
-- Entschieden 07.10.2026: Weg 1 — die VOLLSTAENDIGE Adresse eingeben, bei
-- einem Konto erscheint nur der Name. Kein Teiltreffer, keine Liste.
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Einzelchat_per_Email_V1.md (§12 zuerst)
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/136_konto_per_email.md
--
--
-- DIE REGEL IN VIER SAETZEN
--
-- 1. `konto_per_email(adresse)` gibt IMMER genau eine Zeile:
--    `treffer` (mit Kennung und Name), `kein_konto` oder `gedrosselt`.
--    Verglichen wird exakt (`=` nach `lower`/`btrim`), nie per Muster.
--    Zwei Konten unter derselben kleingeschriebenen Adresse: Fehler (080).
-- 2. Je Konto hoechstens 20 Suchen in 24 Stunden (festes Fenster ab der
--    ersten). Gezaehlt wird jede Suche, Treffer wie Fehlanzeige. Die
--    gesuchte Adresse wird NIE gespeichert.
-- 3. Einzelchats (`kind = 'direct'`) legt nur `get_or_create_direct_chat`
--    an; `kind` ist danach fest; in einen Einzelchat traegt niemand per
--    Hand nach.
-- 4. `get_or_create_direct_chat` findet nur noch Gruppen mit GENAU den
--    beiden als Mitgliedern und einem der beiden als Ersteller, und sie
--    lehnt ein geloeschtes Ziel ab.
--
--
-- WAS SATZ 3 UND 4 SCHLIESSEN (Codex, Bauplan-Pruefung 07.10.2026, hoch)
--
-- `kind = 'direct'` garantierte bis hier keinen Zweierchat:
-- `chat_groups_insert` prueft `kind` nicht, `chat_groups_update` laesst den
-- Ersteller `kind` aendern, und `chat_group_members_insert` (113) laesst ihn
-- JEDE Kennung eintragen. C legt also eine eigene `direct`-Gruppe mit A, B
-- und sich an. Ruft A danach `get_or_create_direct_chat(B)`, sucht die
-- Funktion nur "beide sind Mitglied" — und gibt mit `LIMIT 1` ohne Ordnung
-- womoeglich C's Gruppe zurueck. C liest mit. Die Kennungen von A und B
-- liefert `konto_namen()` (115) jedem Angemeldeten.
--
-- Gemessen 07.10.2026: `kind` ist `text`, Default 'group', ohne CHECK;
-- kein Client schreibt 'direct' selbst (grep beider Repos); 3 Einzelchats im
-- Bestand, alle mit genau 2 Mitgliedern, Ersteller jeweils Mitglied —
-- NICHT ausgenutzt. Nativ bietet die Infoseite im Einzelchat kein
-- "Hinzufuegen" an (`info.tsx:625`). Die PWA tat es bis hierher DOCH
-- (`info/page.tsx`, "Mitglied hinzufuegen" fuer jeden Ersteller; Codex
-- 07.10.2026, F1) — ihr Handler verschluckt Fehler, nach dieser Migration
-- taete der Knopf dort still nichts. Der Gate-Fix (`kind !== 'direct'`)
-- geht deshalb VOR dieser Migration live (Anker 3).
--
-- Warum vier Riegel und nicht einer: (1) allein liesse die Umwidmung einer
-- eigenen 'group'-Gruppe offen (2), und (1)+(2) liessen den Ersteller eines
-- ECHTEN Einzelchats einen Dritten nachtragen (3). (4) ist die Verteidigung
-- in der Tiefe fuer den Bestand und fuer jeden kuenftigen Server-Weg, der
-- RLS umgeht.
--
--
-- WAS BEWUSST BLEIBT
--
-- * Die Existenz einer Adresse verraet heute schon die Registrierung
--   (`user_already_exists`, solange `mailer_autoconfirm` an ist). Neu ist
--   nur der NAME zur Adresse. Nach CN-235 (echte Bestaetigung) ist diese
--   Funktion das einzige Existenz-Orakel — dann Drossel, Antwort bei
--   Fehlanzeige und `email_confirmed_at is not null` neu entscheiden.
-- * Unbestaetigte Adressen (Autoconfirm, SR-03): ein Treffer belegt nur,
--   dass sich jemand mit dieser Adresse registriert hat.
-- * Die Drossel zaehlt je Konto; Konten sind kostenlos. Sie bremst einen
--   ehrlichen Client, keinen Angreifer mit vielen Konten.
-- * `anon` behaelt EXECUTE auf `get_or_create_direct_chat` (vorbestehend,
--   AGENTS.md "NOCH OFFEN"; `create or replace` laesst Grants stehen). Ohne
--   Anmeldung wirft die Funktion.
-- * Zwei gleichzeitige Aufrufe desselben Paares koennen weiterhin zwei
--   Einzelchats anlegen (vorbestehend).
-- * Die Pruefung auf ein geloeschtes Ziel ist nicht mit `konto_loeschen`
--   (132) synchronisiert (Codex 07.10.2026, F5): laeuft die Loeschung
--   zwischen Pruefung und Mitglieder-INSERT durch, steht danach ein
--   Einzelchat mit dem Grabstein. Das ENTSTEHEN ist ein Sekundenfenster;
--   die FOLGE reicht weiter (Codex-Delta D1): ein noch gueltiges Token des
--   Geloeschten lebt bis zu einer Stunde (132), und ueber die frische
--   Mitgliedschaft darf er in dieser Zeit lesen und schreiben. Kein Abfluss
--   an Dritte — es ist sein eigener Chat mit dem Suchenden —, danach ein
--   Chat, der nie eine Antwort bekommt. Eine gemeinsame Sperre muesste 132
--   aendern. Hingenommen.
-- * Wer einen Einzelchat VERSCHENKT (`created_by` per `chat_groups_update`
--   auf einen Dritten setzen, 113: "gewollt-harmlos"), gibt diesem Rechte zum
--   Loeschen und Entfernen, aber kein Lesen und kein Eintragen (Riegel 5);
--   die RPC findet den Chat danach nicht mehr und legt einen zweiten an.
--   Braucht die eigene Handlung eines Mitglieds — kein Weg fuer Dritte
--   (Schlusslesung F6).
--
--
-- TRIGGER-REIHENFOLGE auf `chat_groups`, BEFORE UPDATE, alphabetisch:
--   `trg_chat_groups_hunt_id_fest`, dann `trg_chat_groups_kind_fest` (NEU).
--   Beide werfen nur, keiner aendert NEW — die Reihenfolge ist folgenlos.
-- ⚠ Der neue Trigger feuert auch fuer `postgres`. Die im Backlog geplante
--   Korrektur der PWA-Zweierchats ('group' -> 'direct') braucht dann
--   `set local session_replication_role = replica` in ihrer Transaktion.
--
-- `pg_temp` am ENDE jedes search_path (076). REVOKE namentlich (081/082).
-- `auth.users` voll qualifiziert.
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 136_konto_per_email.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR dem nativen Build applizieren: der Client ruft `konto_per_email`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Zaehler fuer die Drossel
-- ---------------------------------------------------------------------------
--
-- Eine Zeile je Konto, kein Aufraeumen noetig. BEWUSST OHNE Fremdschluessel
-- auf `auth.users` (132, Falle 1: jeder neue FK braucht eine Zeile in der
-- Loeschliste). Nach einer Kontoloeschung bleibt die Zeile als Pseudonym
-- stehen — nicht mehr, als der Grabstein in `profiles` ohnehin zeigt.

create table public.konto_suche_zaehler (
  user_id    uuid primary key,
  fenster_ab timestamptz not null,
  anzahl     integer not null
);

alter table public.konto_suche_zaehler enable row level security;
-- Keine Policy: gelesen und geschrieben wird nur in konto_per_email().
revoke all on table public.konto_suche_zaehler
  from public, anon, authenticated, service_role;

comment on table public.konto_suche_zaehler is
  'Drossel fuer konto_per_email() (136): Suchen je Konto im festen '
  '24-Stunden-Fenster. Ohne Policy, ohne Client-Rechte, ohne FK (132). '
  'Die gesuchte Adresse wird nie gespeichert.';

-- ---------------------------------------------------------------------------
-- 2. konto_per_email()
-- ---------------------------------------------------------------------------
--
-- `returns table` mit OUT-Namen `id`/`display_name`: jede Spaltenreferenz
-- im Rumpf ist qualifiziert, sonst kollidierte sie mit dem OUT-Parameter.
--
-- Der Zaehler laeuft VOR dem Abgleich, als atomarer Upsert: `on conflict do
-- update` sperrt die Zeile, parallele Aufrufe desselben Kontos warten
-- aufeinander und koennen nicht gemeinsam unter der Grenze durchrutschen.
-- Beide CASE lesen die ALTE Zeile — das ist das gewollte feste Fenster.
-- `interval '24 hours'` statt '1 day': absolut, ohne Umstellungsfalle.
--
-- Mehrfachtreffer WERFEN (080, Codex 31.07.2026): der Unique-Index liegt auf
-- der rohen Adresse, nicht auf `lower(email)`; was Dubletten verhindert, ist
-- GoTrue. Eine Auskunft an den Falschen faellt niemandem auf.
--
-- Unicode-Leerraum, den `btrim(…, E' \t\r\n')` nicht kennt, und NFC/NFD
-- fuehren zu `kein_konto` — die sichere Richtung, wie in 080.

create function public.konto_per_email(p_email text)
returns table (ergebnis text, id uuid, display_name text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := lower(btrim(coalesce(p_email, ''), E' \t\r\n'));
  v_anzahl  integer;
  v_treffer bigint;
  v_id      uuid;
  v_name    text;
begin
  if v_uid is null then
    raise exception 'konto_per_email: nicht angemeldet' using errcode = '42501';
  end if;

  insert into public.konto_suche_zaehler as z (user_id, fenster_ab, anzahl)
  values (v_uid, now(), 1)
  on conflict (user_id) do update
     set fenster_ab = case when z.fenster_ab <= now() - interval '24 hours'
                           then now() else z.fenster_ab end,
         anzahl     = case when z.fenster_ab <= now() - interval '24 hours'
                           then 1 else z.anzahl + 1 end
  returning z.anzahl into v_anzahl;

  if v_anzahl > 20 then
    return query select 'gedrosselt'::text, null::uuid, null::text;
    return;
  end if;

  select count(*), (array_agg(p.id))[1], (array_agg(p.display_name))[1]
    into v_treffer, v_id, v_name
    from auth.users u
    join public.profiles p on p.id = u.id
   where v_email <> ''
     and lower(u.email) = v_email          -- exakt, NIE like/ilike
     and u.deleted_at is null
     and not exists (select 1 from public.konto_loeschungen k where k.user_id = u.id);

  if v_treffer = 0 then
    return query select 'kein_konto'::text, null::uuid, null::text;
  elsif v_treffer > 1 then
    raise exception 'konto_per_email: Adresse nicht eindeutig' using errcode = 'P0001';
  else
    return query select 'treffer'::text, v_id, v_name;
  end if;
end;
$$;

revoke execute on function public.konto_per_email(text)
  from public, anon, authenticated, service_role;
grant execute on function public.konto_per_email(text) to authenticated;

comment on function public.konto_per_email(text) is
  'CN-303 (136): Konto zu einer VOLLSTAENDIGEN Adresse — genau eine Zeile '
  '(treffer | kein_konto | gedrosselt), exakter Abgleich, 20 Suchen je '
  '24 h und Konto. Nur authenticated.';

-- ---------------------------------------------------------------------------
-- 3. Einzelchats legt nur die RPC an
-- ---------------------------------------------------------------------------
--
-- ALTER statt DROP/CREATE: die Rollen ({public}) bleiben, wie sie sind.
-- Die Jagd-Bedingung ist zeichengleich mit der bestehenden (127).

alter policy chat_groups_insert on public.chat_groups
  with check (
    created_by = auth.uid()
    and kind is distinct from 'direct'
    and (hunt_id is null
         or hunt_id in (select hunts.id from hunts where hunts.creator_id = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 4. `kind` ist nach dem Anlegen fest
-- ---------------------------------------------------------------------------
--
-- Bauform wie `chat_groups_hunt_id_ist_fest` (127). Eine Policy kann OLD
-- nicht lesen, also ein Trigger.

create function public.chat_groups_kind_ist_fest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'Die Art eines Chats ist fest (chat_groups.kind)'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_chat_groups_kind_fest
  before update on public.chat_groups
  for each row execute function public.chat_groups_kind_ist_fest();

-- ---------------------------------------------------------------------------
-- 5. In einen Einzelchat traegt niemand per Hand nach
-- ---------------------------------------------------------------------------
--
-- Die Subquery laeuft mit den Rechten des Aufrufers; er sieht seine eigenen
-- Gruppen (`chat_groups_select`: Mitglied ODER Ersteller), und nur in die
-- darf er nach dem ersten Zweig ohnehin eintragen. Die RPC und
-- `accept_hunt_invitation` sind SECURITY DEFINER und umgehen RLS.

alter policy chat_group_members_insert on public.chat_group_members
  with check (
    group_id in (select public.get_my_created_group_ids())
    and group_id not in (select g.id from public.chat_groups g where g.kind = 'direct')
  );

-- ---------------------------------------------------------------------------
-- 6. get_or_create_direct_chat() — nur echte Zweierchats, kein geloeschtes Ziel
-- ---------------------------------------------------------------------------
--
-- Signatur, Rueckgabe und Fehlertexte wie bisher; `create or replace`
-- laesst die Grants stehen. Neu:
--   * Ziel muss ein lebendes Konto sein (`deleted_at` / `konto_loeschungen`)
--     — sonst entstuende zwischen Treffer und Tipp ein Chat mit einem
--     Grabstein, ohne Fehlermeldung (Bauplan B6).
--   * Gesucht wird nur eine Gruppe, deren Ersteller einer der beiden ist und
--     die GENAU zwei Mitglieder hat; die aelteste gewinnt (statt LIMIT 1
--     ohne Ordnung).

create or replace function public.get_or_create_direct_chat(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id  uuid;
  existing_chat_id uuid;
  new_chat_id      uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if current_user_id = other_user_id then
    raise exception 'Cannot create chat with self';
  end if;

  if not exists (select 1 from auth.users u
                  where u.id = other_user_id and u.deleted_at is null)
     or exists (select 1 from public.konto_loeschungen k where k.user_id = other_user_id) then
    raise exception 'Konto nicht verfuegbar' using errcode = 'P0002';
  end if;

  select cg.id into existing_chat_id
    from chat_groups cg
   where cg.kind = 'direct'
     and cg.created_by in (current_user_id, other_user_id)
     and exists (select 1 from chat_group_members m
                  where m.group_id = cg.id and m.user_id = current_user_id)
     and exists (select 1 from chat_group_members m
                  where m.group_id = cg.id and m.user_id = other_user_id)
     and (select count(*) from chat_group_members m where m.group_id = cg.id) = 2
   order by cg.created_at
   limit 1;

  if existing_chat_id is not null then
    return existing_chat_id;
  end if;

  insert into chat_groups (name, kind, created_by)
  values ('Direkt', 'direct', current_user_id)
  returning id into new_chat_id;

  insert into chat_group_members (group_id, user_id)
  values (new_chat_id, current_user_id),
         (new_chat_id, other_user_id);

  return new_chat_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Rechte
-- ---------------------------------------------------------------------------
--
-- Trigger-Funktion: niemand ruft sie direkt; Postgres prueft EXECUTE beim
-- ANLEGEN des Triggers, nicht beim Feuern (082, gemessen 31.07.2026).

revoke execute on function public.chat_groups_kind_ist_fest()
  from public, anon, authenticated, service_role;

commit;
