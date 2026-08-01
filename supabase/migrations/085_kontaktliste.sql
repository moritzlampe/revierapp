-- ===========================================================================
-- 085 — Kontaktliste (Gästestamm)
-- ===========================================================================
-- Konzept: quickhunt-native/docs/konzepte/QuickHunt_Konzept_Kontaktliste_V1.md
--          (GELOCKT — 01.08.2026)
--
-- Warum es diese Tabelle braucht: sie ist die erste im Projekt, die eine
-- PERSON OHNE KONTO trägt, ohne an einen Anlass gebunden zu sein. Bisher gibt
-- es dafür nur `hunting_licenses.holder_*` (an einen Schein), `hunt_group_members`
-- (an eine Gruppe) und `driven_hunt_rsvps` (an eine Drückjagd) — keine davon ist
-- eine Personenliste. Gemessen an der echten Gästeliste, die den Anlass gab:
-- von 129 importierbaren Personen hat KEINE ein Konto.
--
-- Damit ist das zugleich Vorbedingung (2) von A-S3 Legitimation V1
-- (Backlog: "vor Oktober"), die dort "der Träger der ganzen Fassung" heißt.
--
-- Die Liste gehört einer PERSON, nicht einem Revier. Grund: Moritz' Vater lädt
-- zu Söder UND Brockwinkel ein — eine reviergebundene Liste hieße, dieselben
-- Personen zweimal zu führen.
--
-- Bewusst NICHT hier drin: Telefon-Normalisierung (E.164). Solange es keine
-- Telefon-Auth gibt, ist eine selbst eingetippte Nummer als Schlüssel wertlos.
-- Konzept §5: roh speichern, erst beim Vergleich normalisieren — nachnormalisieren
-- kann man immer, zurückrechnen nie.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Die Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.kontakte (
  id           uuid primary key default gen_random_uuid(),
  besitzer_id  uuid not null references auth.users(id) on delete cascade,

  -- Vorname und Nachname getrennt, weil die Quelle sie getrennt führt und
  -- 55 von 151 Nachnamen einen Adels- oder Titelzusatz tragen. Ein Split am
  -- Leerzeichen wäre bei "Frhr. v. Vincke" falsch, und zwar still.
  vorname      text,
  nachname     text,

  begleitung   text,          -- "Name der Frau"; Freitext, die Quelle ist unsauber
  email        text,
  telefon      text,          -- Festnetz            (vCard: TEL;TYPE=VOICE/HOME)
  handy        text,          -- kann später matchen (vCard: TEL;TYPE=CELL)
  adresse      text,          -- Freitext, KEIN Strukturblock — es gibt im ganzen
                              -- Schema keinen, und noch keinen Leser dafür
  geburtstag   date,
  notiz        text,

  -- Die Brücke zum Konto. NULL, bis die Person selbst gehandelt hat (eine
  -- Einladung eingelöst). Sie zu setzen verrät deshalb nichts, was der Kontakt
  -- nicht selbst offengelegt hat — s. Konzept §5.3.
  profil_id    uuid references auth.users(id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Der einzige Pflichtwert. Alles andere ist optional, weil ein Adressbuch,
  -- das halbbekannte Personen ablehnt, kein Adressbuch ist: 33 der 175 Zeilen
  -- der echten Liste haben einen Namen und keine Mailadresse.
  -- Auf ein Zeichen geprueft, das kein Leerraum ist — `<> ''` liesse '   ' durch.
  constraint kontakt_braucht_namen
    check (coalesce(vorname, '') ~ '[^[:space:]]'
        or coalesce(nachname, '') ~ '[^[:space:]]')
);

comment on table public.kontakte is
  'Privates Adressbuch je Nutzer. Traegt Personen OHNE Konto. '
  'Kein Verzeichnis: beantwortet "wen lade ich ein?", nie "wer davon nutzt QuickHunt?". '
  'Konzept QuickHunt_Konzept_Kontaktliste_V1.md, Migration 085.';

comment on column public.kontakte.handy is
  'Mobilnummer. Von den zwei Nummernfeldern kann NUR dieses je zum Matchen '
  'dienen — Festnetz empfaengt keine SMS. Roh gespeichert, nicht normalisiert.';

comment on column public.kontakte.profil_id is
  'Gesetzt, sobald die Person eine Einladung eingeloest und damit ihre Kennung '
  'belegt hat. Vorher NULL. Einzige Beruehrung zwischen Kontaktliste und Konto.';


-- "mein Vater und ich fuehren dieselbe Liste" (Moritz, 01.08.2026).
-- Eine Zeile je Beziehung, NICHT ein Array auf jedem Kontakt — sonst waere
-- eine Freigabe ein Update auf 129 Zeilen.
create table if not exists public.kontakt_mitfuehrende (
  besitzer_id   uuid not null references auth.users(id) on delete cascade,
  mitfuehrer_id uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (besitzer_id, mitfuehrer_id),
  constraint mitfuehrer_ist_nicht_besitzer check (besitzer_id <> mitfuehrer_id)
);

comment on table public.kontakt_mitfuehrende is
  'Wer darf das Adressbuch von wem mitfuehren. Lesen UND schreiben — die Liste '
  'wird gemeinsam gepflegt, nicht nur geteilt. Eintragen darf nur der Besitzer.';


-- Die Policies unten schlagen auf `besitzer_id`; ohne Index wird jeder Zugriff
-- ein Seq Scan.
create index if not exists kontakte_besitzer_idx    on public.kontakte (besitzer_id);
create index if not exists kontakte_profil_idx      on public.kontakte (profil_id)
  where profil_id is not null;
create index if not exists kontakt_mitfuehrer_idx   on public.kontakt_mitfuehrende (mitfuehrer_id);


-- `update_updated_at()` existiert seit 003 und wird von profiles/districts/
-- hunts/kills benutzt. Wiederverwendet statt neu geschrieben. Sie ist eine der
-- 14 Triggerfunktionen, denen 082 das EXECUTE entzogen hat — das stoert nicht,
-- weil Postgres EXECUTE beim ANLEGEN des Triggers prueft und diese Migration
-- als Eigentuemer laeuft.
drop trigger if exists trg_kontakte_updated on public.kontakte;
create trigger trg_kontakte_updated
  before update on public.kontakte
  for each row execute function update_updated_at();


-- ---------------------------------------------------------------------------
-- 1b. Zwei Spalten, die kein Client schreiben darf
-- ---------------------------------------------------------------------------
-- Beide Befunde stammen aus dem Codex-Review dieser Datei (01.08.2026) und
-- gehoeren zu derselben Klasse, die dieses Projekt am 31.07. dreimal getroffen
-- hat: eine Berechtigung haengt an etwas, das der Nutzer selbst schreiben darf.
--
-- (1) `besitzer_id`. RLS allein reicht nicht: ein Mitfuehrender B sieht sowohl
--     A als auch sich selbst in `get_my_kontaktbuecher()`. Ein
--     `update kontakte set besitzer_id = B` auf einem Kontakt von A besteht
--     deshalb USING **und** WITH CHECK — B eignet sich den Kontakt an, und nach
--     einem Widerruf der Freigabe hat A ihn verloren. Ein WITH CHECK kann das
--     nicht abfangen, weil es OLD nicht kennt. Also ein Trigger.
--
-- (2) `profil_id`. Die Spalte soll belegen, dass eine Person ihre Kennung
--     bewiesen hat. Duerfte der Besitzer sie frei setzen, waere sie als Beleg
--     wertlos — und jede spaetere Funktion, die daraus etwas ableitet (die
--     Legitimation aus A-S3 tut genau das), haengte an einer Behauptung. Das
--     ist derselbe Fehler wie im ersten Entwurf von 083, wo der Storage-Zugriff
--     an einem Pfad haengen sollte, den der Nutzer selbst schreiben kann.
--
-- Die Funktion ist BEWUSST NICHT `security definer`: als Invoker-Funktion ist
-- `current_user` die aufrufende Rolle, also `authenticated`. Ein spaeterer
-- SECURITY-DEFINER-Setzer laeuft dagegen als Eigentuemer und kommt damit
-- durch — ohne dass dieser Trigger je gelockert werden muss.
create or replace function public.kontakt_feste_spalten()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;                       -- Eigentuemer/Definer-Pfad: durchlassen
  end if;

  if tg_op = 'INSERT' then
    if new.profil_id is not null then
      raise exception 'profil_id wird nicht vom Client gesetzt'
        using errcode = '42501';
    end if;
  else
    if new.besitzer_id is distinct from old.besitzer_id then
      raise exception 'Der Besitzer eines Kontakts ist fest'
        using errcode = '42501';
    end if;
    if new.profil_id is distinct from old.profil_id then
      raise exception 'profil_id wird nicht vom Client gesetzt'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.kontakt_feste_spalten() is
  'Haelt besitzer_id und profil_id gegen Client-Schreibzugriff fest. '
  'Invoker-Funktion, damit ein spaeterer SECURITY-DEFINER-Setzer durchkommt. '
  'Migration 085, nach Codex-Review.';

-- Triggerfunktionen gehoeren niemandem (Regel aus 082): wer sie ausfuehren darf,
-- kann sie an eine EIGENE temporaere Tabelle als Trigger haengen. Postgres prueft
-- EXECUTE beim ANLEGEN des Triggers, nicht beim Feuern — der Entzug bricht den
-- Betrieb also nicht.
revoke all on function public.kontakt_feste_spalten() from public;
revoke all on function public.kontakt_feste_spalten() from anon;
revoke all on function public.kontakt_feste_spalten() from authenticated;
revoke all on function public.kontakt_feste_spalten() from service_role;

drop trigger if exists trg_kontakte_feste_spalten on public.kontakte;
create trigger trg_kontakte_feste_spalten
  before insert or update on public.kontakte
  for each row execute function public.kontakt_feste_spalten();


-- ---------------------------------------------------------------------------
-- 2. Welche Adressbuecher darf ich fuehren?
-- ---------------------------------------------------------------------------
-- Als SECURITY-DEFINER-Funktion statt als Inline-Subquery, weil eine Subquery
-- auf `kontakt_mitfuehrende` innerhalb der Policy erneut deren RLS durchlaufen
-- wuerde — das funktioniert hier zwar, ist aber die zerbrechlichere Bauform.
-- Muster: get_my_jes_district_ids() aus 077.
--
-- `pg_temp` am ENDE des search_path ist Pflicht (Regel seit 076): ungenannt
-- wird das Temp-Schema ZUERST durchsucht, und `authenticated` darf temporaere
-- Tabellen anlegen — der Angriff ist am 31.07.2026 nachgestellt worden.
--
-- Kein Orakel: die Funktion nimmt KEINEN Parameter und gibt nur zurueck, was
-- der Aufrufer ohnehin sehen darf.
create or replace function public.get_my_kontaktbuecher()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid()
  union
  select besitzer_id
    from kontakt_mitfuehrende
   where mitfuehrer_id = auth.uid();
$$;

comment on function public.get_my_kontaktbuecher() is
  'Die Adressbuecher, die der Aufrufer fuehren darf: sein eigenes plus die, '
  'fuer die er als Mitfuehrender eingetragen ist. Parameterlos, damit daraus '
  'kein Orakel wird. Migration 085.';

-- REVOKE ... FROM PUBLIC entzieht bei Supabase GAR NICHTS — die Rollen muessen
-- namentlich genannt werden (Regel seit 081, gemessen an stand_ist_belegt()).
revoke all on function public.get_my_kontaktbuecher() from public;
revoke all on function public.get_my_kontaktbuecher() from anon;
revoke all on function public.get_my_kontaktbuecher() from authenticated;
revoke all on function public.get_my_kontaktbuecher() from service_role;
grant execute on function public.get_my_kontaktbuecher() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.kontakte             enable row level security;
alter table public.kontakt_mitfuehrende enable row level security;

-- Nach Kommando getrennt, NICHT `for all`. Grund (Lehre aus 072/073): eine
-- `for all`-Policy prueft ihr USING auch gegen die NEUE Zeile, ein eigener
-- `with check` hebt das nicht auf.
--
-- `to authenticated` auf jeder Policy: der Ausdruck ruft eine Funktion, auf die
-- `anon` kein EXECUTE hat. Ohne die Rollenangabe wuerde daraus fuer den
-- Gast-Layer ein hartes 42501 statt einer leeren Liste (Lehre aus 069/077/078).

-- `create policy` kennt kein `if not exists`; ohne die Drops waere ein zweiter
-- Lauf ein Fehlschlag. Migration 039 ist genau daran nicht idempotent.
drop policy if exists kontakte_select on public.kontakte;
drop policy if exists kontakte_insert on public.kontakte;
drop policy if exists kontakte_update on public.kontakte;
drop policy if exists kontakte_delete on public.kontakte;
drop policy if exists kontakt_mitfuehrende_select on public.kontakt_mitfuehrende;
drop policy if exists kontakt_mitfuehrende_insert on public.kontakt_mitfuehrende;
drop policy if exists kontakt_mitfuehrende_delete on public.kontakt_mitfuehrende;

create policy kontakte_select on public.kontakte
  for select to authenticated
  using (besitzer_id in (select public.get_my_kontaktbuecher()));

create policy kontakte_insert on public.kontakte
  for insert to authenticated
  with check (besitzer_id in (select public.get_my_kontaktbuecher()));

-- Beide Seiten pruefen: das USING schuetzt die alte Zeile, das WITH CHECK
-- verhindert, einen Kontakt in ein fremdes Adressbuch zu schieben.
create policy kontakte_update on public.kontakte
  for update to authenticated
  using      (besitzer_id in (select public.get_my_kontaktbuecher()))
  with check (besitzer_id in (select public.get_my_kontaktbuecher()));

create policy kontakte_delete on public.kontakte
  for delete to authenticated
  using (besitzer_id in (select public.get_my_kontaktbuecher()));


-- Beide Beteiligten sehen die Beziehung.
create policy kontakt_mitfuehrende_select on public.kontakt_mitfuehrende
  for select to authenticated
  using (besitzer_id = auth.uid() or mitfuehrer_id = auth.uid());

-- DER RIEGEL, AUF DEN ES ANKOMMT.
-- Leitet sich eine Berechtigung aus einer Tabellenzeile ab, ist die Frage nicht
-- "wer darf lesen", sondern "wer darf diese Zeile schreiben". Wer hier eine
-- Zeile anlegen darf, verschafft sich Lesezugriff auf ein fremdes Adressbuch.
-- Dieselbe Wurzel wie die Luecke, die 079 schliessen musste: dort pruefte die
-- Policy nur `issuer_id = auth.uid()` und nichts vom Revier, und jeder
-- Angemeldete konnte sich selbst einen gueltigen Schein fuer JEDES Revier
-- ausstellen.
create policy kontakt_mitfuehrende_insert on public.kontakt_mitfuehrende
  for insert to authenticated
  with check (besitzer_id = auth.uid());

-- Der Besitzer kann widerrufen, der Mitfuehrende kann selbst gehen.
create policy kontakt_mitfuehrende_delete on public.kontakt_mitfuehrende
  for delete to authenticated
  using (besitzer_id = auth.uid() or mitfuehrer_id = auth.uid());

-- KEINE Update-Policy, mit Absicht: beide Spalten sind der Primaerschluessel,
-- es gibt nichts zu aendern. Ohne Policy ist UPDATE damit unmoeglich.


-- ---------------------------------------------------------------------------
-- 4. Gegenproben (nicht Teil der Migration — von Hand fahren)
-- ---------------------------------------------------------------------------
-- a) Fremder traegt sich selbst ein -> muss 42501 werfen:
--      begin;
--      set local role authenticated;
--      set local "request.jwt.claim.sub" = '<fremde uuid>';
--      insert into kontakt_mitfuehrende (besitzer_id, mitfuehrer_id)
--        values ('<Moritz>', '<fremde uuid>');
--      rollback;
--
-- b) anon laeuft nicht in 42501, sondern sieht eine leere Liste:
--      begin; set local role anon; select count(*) from kontakte; rollback;
--
-- c) pg_temp am Ende des search_path bei ALLEN SECURITY-DEFINER-Funktionen
--    (muss 0 Zeilen liefern):
--      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.prosecdef
--         and coalesce(array_to_string(p.proconfig,','),'') not like '%pg_temp%';
--
-- d) Mitfuehrender eignet sich einen fremden Kontakt an -> muss 42501 werfen:
--      begin;
--      set local role authenticated;
--      set local "request.jwt.claim.sub" = '<Mitfuehrer>';
--      update kontakte set besitzer_id = '<Mitfuehrer>' where id = '<Kontakt von A>';
--      rollback;
--
-- e) Client faelscht den Kennungs-Beleg -> muss 42501 werfen, INSERT und UPDATE:
--      insert into kontakte (besitzer_id, nachname, profil_id) values (…, …, '<uuid>');
--      update kontakte set profil_id = '<uuid>' where id = '<eigener Kontakt>';
--
-- f) Positivkontrolle, damit d) und e) nicht bloss "alles wirft" zeigen:
--      update kontakte set notiz = notiz where id = '<eigener Kontakt>';   -- geht durch
-- ---------------------------------------------------------------------------
