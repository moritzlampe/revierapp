-- 166: Stern unter Freunden (CN-577) -- Migration B des Bauplans „Stand und Akku".
-- Bauplan: quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Stand_und_Akku_V1.md
--          (FREIGEGEBEN 23.11.2026, Fassung 4; E8, E9, E10, E11).
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/166_stern_unter_freunden.md
--
-- ANLASS: Feedback #46, Regel Moritz 23.11.2026: „wenn ich einem freund als favoriten
-- hinzufuege (mit stern sozusagen) dann kann er meinen standort sehen / meinen stand,
-- das hat nichts mit der genehmigung der jagdleitung zu tun." Der Stern ist eine
-- EINSEITIGE Freigabe des eigenen Standorts an eine Person, nur auf GEMEINSAMEN Jagden;
-- die Gegenseite bekommt eine Rueckfrage, ob sie zurueck freigibt.
--
-- INHALT
--   1. Tabelle `standort_freigaben` (E8): Geber -> Empfaenger, `aktiv`, `push_am`,
--      `antwort` ('nein'|null). FK je auf auth.users (CASCADE), KEINE Bindung an
--      `kontakte` -- die Freigabe ueberlebt Loeschen und Stilllegen des Kontakts.
--      Nur eine SELECT-Policy (Geber oder Empfaenger); geschrieben wird nur ueber die
--      DEFINER-Funktionen unten. In der Realtime-Publikation (Stern an/aus erreicht
--      den Freund sofort; RLS filtert die Ereignisse).
--   2. `stern_setzen(p_empfaenger, p_an)` (E8): setzen nur, wenn der Empfaenger in der
--      EIGENEN Gaesteliste mit `profil_id` steht (die setzt nur der Server, 157) ODER
--      er mir schon einen aktiven Stern gegeben hat; zuruecknehmen = `aktiv = false`.
--   3. `stern_antworten(p_geber, p_ja)` (E8): nur bei aktiver eingehender Freigabe;
--      „Ja" legt die Gegen-Freigabe an bzw. reaktiviert sie, „Nein" setzt `antwort`.
--   4. `eingehende_sterne()` (E10): offene Rueckfragen samt `profiles.display_name`
--      des Gebers (`konto_namen` reicht ohne Beziehung nicht, 157).
--      `ausgehende_sterne()` (Ergaenzung zum Bauplan, E9 „Standort freigegeben an"):
--      die aktiven eigenen Sterne samt Namen -- nach einem „Ja" an jemanden ausserhalb
--      der Gaesteliste kennt die App den Namen sonst aus keiner Quelle.
--   5. `stern_push_beanspruchen(p_geber, p_empfaenger)` (E10): atomarer Anspruch auf
--      die Push `stern` -- hoechstens eine je 7 Tage, nur ohne Antwort und ohne
--      Gegen-Freigabe. Nur `service_role` (die Push-Route prueft den Absender,
--      Muster `schein_empfaenger`).
--   6. `freundes_staende(p_hunt)` (E9): je aktiver eingehender Freigabe der WIRKSAME
--      Stand des Gebers (Treiben in Kraft wie `treibenInKraft`/164 E1-4, sonst
--      Sitzplan wie `effectiveStand`), nur wenn er unter `staende_der_teilnahme`
--      faellt; `eingecheckt` nur bei einem Bezug auf genau diesen Stand, `adhoc` ohne
--      Kartenobjekt (Ad-hoc- oder Selbststand).
--   7. `live_sichtbare_teilnahmen()` (164): ODER-Zweig Stern (E9).
--   8. `konto_loeschen()` (157): beide Richtungen der Freigaben weg (E8); `profil_id` in
--      fremden Kontakten wird dort NULL, damit ist der Weg zu einem neuen Stern zu.
--      PREIS (Codex 166 B2): ein `stern_setzen`/`stern_antworten`, das GLEICHZEITIG mit
--      `konto_loeschen` laeuft, kann nach dessen Commit eine Zeile an das geloeschte Konto
--      hinterlassen. Sie wirkt nicht -- das Konto hat keine Teilnahme und kein Push-Abo
--      mehr; die beiden Listen und der Push-Anspruch blenden Konten in Loeschung aus. Ein Riegel
--      (gemeinsame Advisory-Sperre mit `konto_loeschen`) waere moeglich; er kostete einen
--      Eingriff in die Sperrfolge der Kontoloeschung fuer eine Zeile ohne Wirkung.
--
-- TORE von Punkt (7) und Stand (6), gleich: Freigabe `aktiv`; beide `joined` in DIESER
-- Jagd (ein Entfernter ist `left`, trg_teilnehmer_entfernt_am); Jagd `active`/`paused`; beim Geber Consent nicht
-- `none` und `ortung_pausiert_seit is null`. Der Stand zusaetzlich `staende_offen`.
-- Kein Zweig in `weg_sichtbare_teilnahmen` (Pirschweg ueber den Stern ist
-- Nicht-Umfang, CN-585 ff.).
--
-- BAUREGEL: `live_sichtbare_teilnahmen` und `konto_loeschen` aus `pg_get_functiondef`
-- des Katalogs (25.11.2026), nicht aus einer Datei (076-Loch). CREATE OR REPLACE
-- behaelt ACL, SECURITY DEFINER und search_path. Neue DEFINER-Funktionen: `pg_temp`
-- am ENDE des search_path, EXECUTE namentlich entzogen (PUBLIC, anon, authenticated,
-- service_role) und nur der Rolle gegeben, die sie braucht.
--
-- POSTGREST: zwei FKs der neuen Tabelle auf DASSELBE Ziel (auth.users). `auth` ist kein
-- exponiertes Schema -- PostgREST bildet ueber diese Tabelle keine Beziehung, keine
-- bestehende Einbettung aendert sich (154, CN-510). Gegenprobe nach dem Apply per REST.
--
-- REALTIME: eigene `id` als Primaerschluessel (Abschnitt 1) -- ein DELETE-Ereignis traegt
-- nur sie, nicht das Paar Geber/Empfaenger.
--
-- SPERREN: die zwei FKs auf auth.users nehmen SHARE ROW EXCLUSIVE auf auth.users bis zum
-- Transaktionsende (Probelauf und Apply, je wenige Sekunden): solange warten Anmeldung,
-- Registrierung und jede andere Schreibung auf auth.users (wie bei 111/127/131/132;
-- Schlusslesung 166 F4). Sonst nur die neue Tabelle, Funktionstausch, Publikation. Nur bei 0
-- laufenden Jagden (Bauplan E11; der Tausch von `live_sichtbare_teilnahmen` aendert, wer
-- welchen Live-Punkt sieht).
-- Im Betrieb (Codex-Deltas 2 und 3): `stern_setzen` und `stern_antworten` sperren je Paar
-- (Advisory, Schluessel `stern:<kleinere>:<groessere uuid>`); wer zwei Zeilen anfasst
-- (`stern_setzen` beim Zuruecknehmen, `konto_loeschen`), sperrt sie nach `id`.

begin;

-- ===== 1. Tabelle standort_freigaben =====
create table public.standort_freigaben (
  -- Eigene Kennung als Primaerschluessel, nicht (geber_id, empfaenger_id): Realtime
  -- liefert ein DELETE OHNE RLS-Pruefung an jeden Abonnenten der Tabelle, mit dem
  -- Primaerschluessel als einzigem Inhalt (die App verlaesst sich bei
  -- positions_current genau darauf). Mit dem Paar als Schluessel verriete jedes
  -- Loeschen (konto_loeschen), wer wem einen Stern gegeben hatte.
  id            uuid        primary key default gen_random_uuid(),
  geber_id      uuid        not null references auth.users (id) on delete cascade,
  empfaenger_id uuid        not null references auth.users (id) on delete cascade,
  aktiv         boolean     not null default true,
  push_am       timestamptz,
  antwort       text,
  angelegt_am   timestamptz not null default now(),
  constraint standort_freigaben_paar unique (geber_id, empfaenger_id),
  constraint standort_freigaben_nicht_selbst check (geber_id <> empfaenger_id),
  constraint standort_freigaben_antwort_wert check (antwort = 'nein')
);

alter table public.standort_freigaben enable row level security;

create policy standort_freigaben_select on public.standort_freigaben
  for select to authenticated
  using (geber_id = auth.uid() or empfaenger_id = auth.uid());

-- Supabase vergibt auf neue Tabellen ALL an anon/authenticated (Default Privileges).
-- Ohne Schreib-Policy waere ein Client-Write ohnehin 0 Zeilen; der Entzug macht daraus
-- ein hartes 42501 und haelt `anon` ganz fern.
revoke all on table public.standort_freigaben from anon, authenticated;
grant select on table public.standort_freigaben to authenticated;

alter publication supabase_realtime add table public.standort_freigaben;

-- ===== 2. stern_setzen =====
create function public.stern_setzen(p_empfaenger uuid, p_an boolean)
returns boolean
language plpgsql
strict
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ich uuid := auth.uid();
begin
  -- Ein Paar zur Zeit (Codex-Delta 3 auf 166): `stern_setzen` und `stern_antworten` nehmen
  -- dieselbe Sperre je Paar. Sonst koennte die Gegenzeile WAEHREND einer Ruecknahme entstehen
  -- und, mit kleinerer id, an der Reihenfolge unten vorbei einen Deadlock bilden.
  perform pg_advisory_xact_lock(hashtextextended(
    'stern:' || least(v_ich, p_empfaenger)::text || ':' || greatest(v_ich, p_empfaenger)::text, 0));
  -- Sich selbst: an der Gaesteliste unten (42501), dahinter der CHECK (23514).
  if not p_an then
    -- Beide Richtungen VORAB nach id sperren (Codex-Delta 2 auf 166): nehmen zwei Freunde
    -- gleichzeitig zurueck, sperrte sonst jeder zuerst die eigene, dann die fremde Zeile —
    -- Deadlock, und ein Stern bliebe aktiv. Dieselbe Reihenfolge nimmt `konto_loeschen`.
    perform 1 from public.standort_freigaben f
      where (f.geber_id = v_ich and f.empfaenger_id = p_empfaenger)
         or (f.geber_id = p_empfaenger and f.empfaenger_id = v_ich)
      order by f.id
      for update;
    -- Zuruecknehmen geht immer und wirkt sofort (Realtime, Live-Zweig, Staende).
    update public.standort_freigaben f
       set aktiv = false
     where f.geber_id = v_ich and f.empfaenger_id = p_empfaenger and f.aktiv;
    -- Wer seinen Stern zuruecknimmt, sagt zugleich „Nein" zur Gegenrichtung
    -- (Schlusslesung 166 F3): sonst stuende die Rueckfrage sofort wieder da, und
    -- nach 7 Tagen kaeme die Push erneut.
    update public.standort_freigaben f
       set antwort = 'nein'
     where f.geber_id = p_empfaenger and f.empfaenger_id = v_ich and f.antwort is null;
    return false;
  end if;

  -- Wem ich einen Stern geben darf: wer in MEINER Gaesteliste mit Konto steht
  -- (`profil_id` setzt nur der Server, 157), oder wer mir schon einen gegeben hat.
  -- Sonst liesse sich jede geratene Konto-id mit Pushes bewerfen.
  if not exists (select 1 from public.kontakte k
                  where k.besitzer_id = v_ich and k.profil_id = p_empfaenger)
     and not exists (select 1 from public.standort_freigaben f
                      where f.geber_id = p_empfaenger and f.empfaenger_id = v_ich and f.aktiv) then
    raise exception 'nicht_erlaubt' using errcode = '42501';
  end if;

  -- Reaktivieren laesst `antwort` und `push_am` stehen: ein „Nein" bleibt ein Nein,
  -- und an-aus-an erzeugt keine zweite Push binnen 7 Tagen.
  insert into public.standort_freigaben (geber_id, empfaenger_id)
  values (v_ich, p_empfaenger)
  on conflict (geber_id, empfaenger_id) do update set aktiv = true;
  return true;
end
$function$;

revoke all on function public.stern_setzen(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.stern_setzen(uuid, boolean) to authenticated;

-- ===== 3. stern_antworten =====
create function public.stern_antworten(p_geber uuid, p_ja boolean)
returns boolean
language plpgsql
strict
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ich uuid := auth.uid();
begin
  -- Dieselbe Paar-Sperre wie `stern_setzen` (Codex-Delta 3 auf 166).
  perform pg_advisory_xact_lock(hashtextextended(
    'stern:' || least(v_ich, p_geber)::text || ':' || greatest(v_ich, p_geber)::text, 0));
  -- Nur auf eine AKTIVE eingehende Freigabe; hat der Geber sie inzwischen
  -- zurueckgenommen, gibt es nichts mehr zu beantworten.
  if not exists (select 1 from public.standort_freigaben f
                  where f.geber_id = p_geber and f.empfaenger_id = v_ich and f.aktiv) then
    raise exception 'nicht_erlaubt' using errcode = '42501';
  end if;

  if p_ja then
    insert into public.standort_freigaben (geber_id, empfaenger_id)
    values (v_ich, p_geber)
    on conflict (geber_id, empfaenger_id) do update set aktiv = true;
  else
    update public.standort_freigaben f
       set antwort = 'nein'
     where f.geber_id = p_geber and f.empfaenger_id = v_ich;
  end if;
  return p_ja;
end
$function$;

revoke all on function public.stern_antworten(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.stern_antworten(uuid, boolean) to authenticated;

-- ===== 4. eingehende_sterne, ausgehende_sterne =====
create function public.eingehende_sterne()
returns table (geber_id uuid, name text, angelegt_am timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select f.geber_id, p.display_name, f.angelegt_am
    from public.standort_freigaben f
    left join public.profiles p on p.id = f.geber_id
   where f.empfaenger_id = auth.uid()
     and f.aktiv
     and f.antwort is null
     and not exists (select 1 from public.standort_freigaben g
                      where g.geber_id = auth.uid() and g.empfaenger_id = f.geber_id and g.aktiv)
     and not exists (select 1 from public.konto_loeschungen l where l.user_id = f.geber_id)  -- Preis B2
   order by f.angelegt_am desc;
$function$;

revoke all on function public.eingehende_sterne() from public, anon, authenticated, service_role;
grant execute on function public.eingehende_sterne() to authenticated;

create function public.ausgehende_sterne()
returns table (empfaenger_id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  -- Den Profilnamen nur, wenn der Empfaenger selbst gehandelt hat (eine Zeile von ihm
  -- an mich, 157: Namen nach Beziehung); sonst der Name aus MEINER Gaesteliste
  -- (Schlusslesung 166 F1).
  select f.empfaenger_id,
         case when exists (select 1 from public.standort_freigaben g
                            where g.geber_id = f.empfaenger_id and g.empfaenger_id = auth.uid())
              then p.display_name
              else (select nullif(btrim(concat_ws(' ', k.vorname, k.nachname)), '')
                      from public.kontakte k
                     where k.besitzer_id = auth.uid() and k.profil_id = f.empfaenger_id
                     limit 1)
         end
    from public.standort_freigaben f
    left join public.profiles p on p.id = f.empfaenger_id
   where f.geber_id = auth.uid()
     and f.aktiv
     and not exists (select 1 from public.konto_loeschungen l where l.user_id = f.empfaenger_id)  -- Preis B2
   order by 2;
$function$;

revoke all on function public.ausgehende_sterne() from public, anon, authenticated, service_role;
grant execute on function public.ausgehende_sterne() to authenticated;

-- ===== 5. stern_push_beanspruchen =====
-- Atomar: das UPDATE sperrt die Zeile; ein gleichzeitiger zweiter Aufruf wartet und
-- prueft `push_am` danach neu -- ein Doppeltipp ergibt EINE Push.
create function public.stern_push_beanspruchen(p_geber uuid, p_empfaenger uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $function$
  with angespr as (
    update public.standort_freigaben f
       set push_am = now()
     where f.geber_id = p_geber
       and f.empfaenger_id = p_empfaenger
       and f.aktiv
       and f.antwort is null
       and (f.push_am is null or f.push_am < now() - interval '7 days')
       and not exists (select 1 from public.standort_freigaben g
                        where g.geber_id = p_empfaenger and g.empfaenger_id = p_geber and g.aktiv)
       -- Preis B2 (Codex 166 Delta): eine verwaiste Zeile eines Kontos in Loeschung loest keine Push aus.
       and not exists (select 1 from public.konto_loeschungen l where l.user_id in (p_geber, p_empfaenger))
    returning 1)
  select exists (select 1 from angespr);
$function$;

revoke all on function public.stern_push_beanspruchen(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.stern_push_beanspruchen(uuid, uuid) to service_role;

-- ===== 6. freundes_staende =====
create function public.freundes_staende(p_hunt uuid)
returns table (teilnahme_id uuid, stand_name text,
               lat double precision, lng double precision, eingecheckt boolean,
               adhoc boolean)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  with geber as (
    select hp.id, hp.user_id
      from public.standort_freigaben f
      join public.hunt_participants hp
        on hp.user_id = f.geber_id and hp.hunt_id = p_hunt
      join public.hunts h on h.id = hp.hunt_id
     where f.empfaenger_id = auth.uid()
       and f.aktiv
       and exists (select 1 from public.hunt_participants m
                    where m.hunt_id = p_hunt and m.user_id = auth.uid()
                      and m.status = 'joined')
       -- `joined` schliesst Entfernte aus: `entfernt_am` gibt es nur bei `left`
       -- (trg_teilnehmer_entfernt_am).
       and hp.status = 'joined'
       and hp.position_consent is distinct from 'none'
       and hp.ortung_pausiert_seit is null
       and h.status in ('active', 'paused')
       and public.staende_offen(p_hunt)
  ),
  -- Treiben in Kraft wie `treibenInKraft` (assignment.ts) und 164 E1-4: das
  -- laufende; laeuft keins und hat die Jagd genau EIN Treiben, das noch geplant
  -- ist, dann dieses.
  in_kraft as (
    select coalesce(
      (select d.id from public.hunt_drives d
        where d.hunt_id = p_hunt and d.status = 'active' limit 1),
      (select d.id from public.hunt_drives d
        where d.hunt_id = p_hunt and d.status = 'pending'
          and (select count(*) from public.hunt_drives x where x.hunt_id = p_hunt) = 1)
    ) as drive_id
  ),
  -- Wirksamer Stand wie `effectiveStand`: der Stand im Treiben in Kraft; ohne ihn
  -- der Sitzplan -- ausser ein ANDERER ist im Treiben in Kraft auf meinen
  -- Selbststand eingeteilt (E2, CN-578).
  wirksam as (
    -- hoechstens eine Zeile je Teilnahme: UNIQUE (drive_id, participant_id).
    select g.id as teilnahme_id, g.user_id,
           ds.map_object_id as objekt_id, ds.seat_assignment_id as sitz_id
      from geber g
      join in_kraft k on k.drive_id is not null
      join public.hunt_drive_stands ds on ds.drive_id = k.drive_id and ds.participant_id = g.id
  ),
  sitzplan as (
    select g.id as teilnahme_id, g.user_id, s.seat_id as objekt_id, s.id as sitz_id
      from geber g
      join public.hunt_seat_assignments s on s.hunt_id = p_hunt and s.user_id = g.user_id
     where not exists (select 1 from wirksam w where w.teilnahme_id = g.id)
       and ((s.seat_type = 'assigned' and s.seat_id is not null)
            or (s.seat_type = 'adhoc' and s.position_lat is not null and s.position_lng is not null))
       and not (s.gesetzt_von is not distinct from s.user_id
                and s.seat_type = 'adhoc'
                and exists (select 1 from in_kraft k
                              join public.hunt_drive_stands ds on ds.drive_id = k.drive_id
                             where ds.seat_assignment_id = s.id
                               and ds.participant_id is not null
                               and ds.participant_id <> g.id))
  ),
  stand as (
    select * from wirksam
    union all
    select * from sitzplan
  )
  -- Nur was `staende_der_teilnahme` dem Geber zuschreibt (Revier/Schein, nicht
  -- geloescht, Freigabe der Staende) -- ein Treiben-Verweis auf eine beliebige
  -- Objekt-id liefert damit nichts.
  -- Liefert staende_der_teilnahme dasselbe Objekt zweimal (mit und ohne Sitz), gewinnt
  -- die Zeile, an der der Bezug haengt (Codex 166 B1).
  select distinct on (st.teilnahme_id)
         st.teilnahme_id,
         coalesce(o.name, sa.seat_name) as stand_name,
         st_y(sd.ort)::double precision as lat,
         st_x(sd.ort)::double precision as lng,
         exists (select 1 from public.hunt_stand_bezug b
                  where b.participant_id = st.teilnahme_id
                    and ((sd.objekt_id is not null and b.map_object_id = sd.objekt_id)
                         or (sd.sitz_id is not null and b.seat_assignment_id = sd.sitz_id))) as eingecheckt,
         -- Ohne Kartenobjekt ein Ad-hoc- oder Selbststand: die App zeichnet dann den
         -- Ad-hoc-Pin statt des Hochsitzes (Codex-Delta Karte, S9).
         sd.objekt_id is null as adhoc
    from stand st
    cross join lateral public.staende_der_teilnahme(st.teilnahme_id) sd
    left join public.map_objects o on o.id = sd.objekt_id
    left join public.hunt_seat_assignments sa on sa.id = sd.sitz_id
   where (st.objekt_id is not null and sd.objekt_id = st.objekt_id)
      or (st.objekt_id is null and st.sitz_id is not null and sd.sitz_id = st.sitz_id)
   order by st.teilnahme_id, eingecheckt desc;
$function$;

revoke all on function public.freundes_staende(uuid) from public, anon, authenticated, service_role;
grant execute on function public.freundes_staende(uuid) to authenticated;

-- ===== 7. live_sichtbare_teilnahmen (164) =====
CREATE OR REPLACE FUNCTION public.live_sichtbare_teilnahmen()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

-- ===== 8. konto_loeschen (157) =====
CREATE OR REPLACE FUNCTION public.konto_loeschen(p_uid uuid, p_fotos_behalten boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 166 (CN-577, E8): Stern-Freigaben in beide Richtungen. Der FK auf auth.users
  -- greift nicht, weil die Loeschung das Auth-Konto nicht entfernt (Soft-Delete).
  -- Nach id sperren wie `stern_setzen`, und in EINEM Statement (Codex-Deltas 3 und 4):
  -- ein ungeordnetes DELETE, oder Sperre und DELETE mit zwei Snapshots, bildeten mit
  -- einer gleichzeitigen Ruecknahme einen Deadlock.
  delete from standort_freigaben f
   using (select x.id from standort_freigaben x
           where x.geber_id = p_uid or x.empfaenger_id = p_uid
           order by x.id
             for update) s
   where f.id = s.id;

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

commit;
