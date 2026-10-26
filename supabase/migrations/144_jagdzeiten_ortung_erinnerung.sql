-- 144: Jagdzeiten je Jagd und die Erinnerung "Ortung noch aus" (CN-416).
--
-- ANLASS: Moritz nach der Slowakei-Jagd, 26.10.2026: "es fehlt noch wenn man
-- die ortung ausmacht das wir am naechsten morgen eine pushnachricht schicken
-- in der art: guten morgen: Ortung wieder starten ? Max hatte es zb einmal
-- vergessen" — und: "zeitfenster einstellen ... also zb 07-09 Uhr und 18-22
-- Uhr". Eintragen soll sie der Jagdleiter.
-- Bauplan (F14 geprueft, FREIGEGEBEN Fassung 5, 26.10.2026):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Ortung_Erinnerung_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/144_jagdzeiten_ortung_erinnerung.md
--
--
-- DIE REGEL IN FUENF SAETZEN
--
-- 1. `hunts.jagdzeiten` ist eine Liste von 1-4 Fenstern {von, bis} im Format
--    "HH:MM", jeden Tag gleich, Zeitzone fest Europe/Berlin (Bauplan E1).
--    NULL heisst "keine Jagdzeiten"; dann gilt die Vorgabe 05:30 (E2).
-- 2. Erinnert wird zu Beginn eines Fensters `B` jeder, der sich VOR `B`
--    abgemeldet hat (`ortung_pausiert_seit`, 126) — bei der Vorgabe nur an
--    einem spaeteren Berliner Kalendertag als die Abmeldung (E2).
-- 3. `ortung_faelliger_fensterbeginn()` ist DIE Regel: das juengste erreichte
--    `B` aus heute und gestern; nach dem geplanten Ende (`scheduled_until`)
--    keines (E4, E6). Die App rechnet sie in TypeScript nach
--    (`src/lib/hunt/ortung-pause.ts`) — dieselbe Testtabelle
--    (`src/lib/hunt/__tests__/ortung-erinnerung-faelle.json`) laeuft gegen
--    beide. Wer eine Seite aendert, aendert die andere mit.
-- 4. `ortung_erinnerungen_beanspruchen()` beansprucht in EINEM UPDATE jedes
--    faellige `B` hoechstens einmal (`hunt_participants.ortung_erinnert_fuer`)
--    und gibt die Empfaenger zurueck. Faellig ist `B` fuer den Versand nur
--    30 Minuten lang; die App fragt ohne Obergrenze (E6, die einzige
--    Abweichung).
-- 5. Aufrufen darf sie NUR `service_role` — die PWA-Route
--    `/api/push/ortung`, angestossen von einem Coolify-Zeitplan alle 5 min
--    (E3 b′, E9). Kein `pg_net`, kein Cron-Job in der DB (M13).
--
--
-- WARUM EINE SPALTE AN `hunts` (E1): sie erbt die Schreibrechte der Jagd
-- (`hunts_creator_all`, `hunts_leader_update`), kein neues RLS. Kein
-- Trigger auf `hunts` trifft sie (gemessen 26.10.2026, 13 Trigger).
-- Ueberlappende Fenster werden NICHT geprueft — fuer CN-416 harmlos (zwei
-- Beginne, zwei Erinnerungen), CN-192 muss sie regeln.
--
-- WARUM DIE PRUEFFUNKTION PL/PGSQL IST: `jsonb_object_keys` wirft auf
-- einem Nicht-Objekt, und SQL garantiert die Auswertungsreihenfolge eines
-- `or` nicht. Die verschachtelten `if` legen sie fest. Regex statt
-- `::time`-Cast: `time_in` ist STABLE ('now' waere gueltige Eingabe), ein
-- CHECK braucht IMMUTABLE (F-C1). EXECUTE bleibt bei `authenticated`: ein
-- CHECK ruft die Funktion mit den Rechten des Schreibenden.
--
-- WARUM `beanspruchen` SECURITY INVOKER IST: der einzige Aufrufer ist
-- `service_role`, das RLS ohnehin umgeht. Ein DEFINER braeuchte keinen
-- Grund und waere eine Flaeche mehr (076/082). `p_jetzt` gibt es fuer den
-- Probelauf; die Route ruft ohne Argument.
--
-- GENAU EINMAL BEANSPRUCHT (E4): ein zweiter, ueberlappender Lauf wartet an
-- der Zeilensperre, wertet die WHERE-Bedingung gegen die neue Zeile neu aus
-- (`ortung_erinnert_fuer < B` ist dann falsch) und findet 0 Zeilen. Dasselbe
-- traegt gegen ein gleichzeitiges Wiederanmelden: deshalb stehen ALLE
-- Teilnahme-Bedingungen im UPDATE selbst, nicht in einem CTE davor.
-- Hingenommen: die JAGD-Zeile wird nicht gesperrt — endet die Jagd im selben
-- Augenblick, kann eine letzte Push noch hinausgehen (sie verfaellt
-- spaetestens 30 min nach dem Fensterbeginn, `expiration`).
-- ZUGESTELLT wird nicht genau einmal: scheitert der Versand, setzt die Route
-- per Compare-and-Swap auf `B - 1 ms` zurueck (nicht auf NULL: sonst kaeme
-- ein frueheres, schon zugestelltes Fenster ein zweites Mal, Gesamtpruefung
-- S9).
--
-- `ortung_erinnert_fuer` ist wie `ortung_pausiert_seit` vom Jagdleiter
-- schreibbar (`participants_leader_all`) — schlimmstenfalls eine Push mehr
-- oder weniger. Gehoert zu CN-198.
--
--
-- SPERRREIHENFOLGE: erst `hunt_participants`, dann `hunts`, wie 143 (der
-- Live-Verkehr beruehrt erst die Teilnahme, dann per Trigger die Jagd).
-- Abschnitte nicht umstellen. Applizieren, wenn keine Jagd laeuft.
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" \
--        -c "set statement_timeout = '120s'" -f 144_jagdzeiten_ortung_erinnerung.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⛔ VOR der PWA-Route und VOR dem nativen Build applizieren: die App fragt
-- `hunts.jagdzeiten` im Jagdkopf ab — ohne die Spalte scheitert er ganz.

begin;

-- 1. Teilnahme: wofuer zuletzt erinnert wurde --------------------------------

alter table public.hunt_participants
  add column ortung_erinnert_fuer timestamptz;

comment on column public.hunt_participants.ortung_erinnert_fuer is
  'CN-416 (144): Fensterbeginn B, fuer den zuletzt eine Erinnerung "Ortung noch aus" beansprucht wurde. Setzt ortung_erinnerungen_beanspruchen(); nach einem Fehlschlag setzt die Route auf B - 1 ms zurueck. NULL = nie erinnert.';

-- 2. Jagd: die Jagdzeiten ----------------------------------------------------

create or replace function public.jagdzeiten_gueltig(z jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  e jsonb;
  gesehen text[] := '{}';
begin
  if z is null then
    return true;
  end if;
  if jsonb_typeof(z) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(z) not between 1 and 4 then
    return false;
  end if;

  for e in select value from jsonb_array_elements(z) loop
    if jsonb_typeof(e) <> 'object' then
      return false;
    end if;
    if not (e ?& array['von', 'bis']) or e - 'von' - 'bis' <> '{}'::jsonb then
      return false;
    end if;
    -- Ohne diesen Test liefe {"bis": null} durch: `NULL !~ …` ist NULL, kein `if` greift.
    if jsonb_typeof(e -> 'von') <> 'string' or jsonb_typeof(e -> 'bis') <> 'string' then
      return false;
    end if;
    if (e ->> 'von') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (e ->> 'bis') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;
    if (e ->> 'von') = (e ->> 'bis') or (e ->> 'von') = any (gesehen) then
      return false;
    end if;
    gesehen := gesehen || (e ->> 'von');
  end loop;

  return true;
end;
$$;

alter table public.hunts
  add column jagdzeiten jsonb;

alter table public.hunts
  add constraint hunts_jagdzeiten_form check (public.jagdzeiten_gueltig(jagdzeiten));

comment on column public.hunts.jagdzeiten is
  'CN-416 (144): Jagdzeiten [{"von":"07:00","bis":"09:00"}, ...], 1-4 Fenster, jeden Tag gleich, Europe/Berlin; bis < von = ueber Mitternacht. NULL = keine (Vorgabe 05:30 fuer die Erinnerung). Setzt der Jagdleiter.';
comment on function public.jagdzeiten_gueltig(jsonb) is
  'CN-416 (144): Form von hunts.jagdzeiten fuer den CHECK hunts_jagdzeiten_form. Ueberlappung wird bewusst nicht geprueft.';

-- 3. Die Regel: das juengste erreichte Fensterbeginn ----------------------------

create or replace function public.ortung_faelliger_fensterbeginn(
  p_jagdzeiten     jsonb,
  p_pausiert_seit  timestamptz,
  p_geplantes_ende timestamptz,
  p_jetzt          timestamptz
)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select max(k.b)
    from (
      select ((t.tag + f.von::time) at time zone 'Europe/Berlin') as b,
             f.vorgabe
        from (select e ->> 'von' as von, false as vorgabe
                from jsonb_array_elements(p_jagdzeiten) e
              union all
              select '05:30', true
               where p_jagdzeiten is null) f
       cross join (values ((p_jetzt at time zone 'Europe/Berlin')::date),
                          ((p_jetzt at time zone 'Europe/Berlin')::date - 1)) t(tag)
    ) k
   where (p_geplantes_ende is null or p_geplantes_ende > p_jetzt)
     and k.b <= p_jetzt
     and k.b > p_pausiert_seit
     and (not k.vorgabe
          or (k.b at time zone 'Europe/Berlin')::date
             > (p_pausiert_seit at time zone 'Europe/Berlin')::date);
$$;

comment on function public.ortung_faelliger_fensterbeginn(jsonb, timestamptz, timestamptz, timestamptz) is
  'CN-416 (144): juengster erreichter Fensterbeginn B (heute und gestern, Berliner Datum) nach der Abmeldung, sonst NULL; nach dem geplanten Ende (scheduled_until) immer NULL. Ohne Jagdzeiten 05:30, aber nur an einem spaeteren Kalendertag als die Abmeldung. Gleiche Regel in der App: ortung-pause.ts.';

-- 4. Beanspruchen: genau einmal je Fensterbeginn --------------------------------

create or replace function public.ortung_erinnerungen_beanspruchen(
  p_jetzt timestamptz default now()
)
returns table (user_id uuid, hunt_id uuid, jagdname text, fensterbeginn timestamptz)
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  -- ⚠ Jede Teilnahme-Bedingung steht in DIESEM WHERE, keine in einem CTE
  -- davor (Codex M1, Punkt 3): wartet das UPDATE an der Zeilensperre, wertet
  -- Postgres danach nur die eigenen Bedingungen gegen die NEUE Zeile aus.
  -- Ein CTE behielte den alten Stand — wer genau dann die Ortung wieder
  -- einschaltet oder `position_consent = 'none'` setzt, bekaeme die Push.
  -- Die Regel steht deshalb dreimal da; sie ist STABLE und billig.
  update public.hunt_participants hp
     set ortung_erinnert_fuer = public.ortung_faelliger_fensterbeginn(
           h.jagdzeiten, hp.ortung_pausiert_seit, h.scheduled_until, p_jetzt)
    from public.hunts h
   where hp.hunt_id = h.id
     and h.status = 'active'
     and hp.status = 'joined'
     and hp.user_id is not null
     and hp.ortung_pausiert_seit is not null
     and hp.position_consent is distinct from 'none'
     and public.ortung_faelliger_fensterbeginn(
           h.jagdzeiten, hp.ortung_pausiert_seit, h.scheduled_until, p_jetzt)
         > p_jetzt - interval '30 minutes'
     and (hp.ortung_erinnert_fuer is null
          or hp.ortung_erinnert_fuer < public.ortung_faelliger_fensterbeginn(
               h.jagdzeiten, hp.ortung_pausiert_seit, h.scheduled_until, p_jetzt))
  returning hp.user_id, hp.hunt_id, h.name, hp.ortung_erinnert_fuer;
$$;

comment on function public.ortung_erinnerungen_beanspruchen(timestamptz) is
  'CN-416 (144): beansprucht je laufender Jagd und abgemeldetem Teilnehmer das faellige Fenster B (hoechstens 30 min alt) und gibt die Empfaenger zurueck. Nur service_role (PWA-Route /api/push/ortung). p_jetzt nur fuer Proben.';

-- Neue Funktionen bekommen per ALTER DEFAULT PRIVILEGES EXECUTE an anon,
-- authenticated und service_role — ein REVOKE FROM PUBLIC allein entzoege
-- nichts (AGENTS.md, "Migrationen").
revoke execute on function public.ortung_erinnerungen_beanspruchen(timestamptz)
  from public, anon, authenticated;
grant execute on function public.ortung_erinnerungen_beanspruchen(timestamptz)
  to service_role;
-- `jagdzeiten_gueltig` und `ortung_faelliger_fensterbeginn` behalten die
-- Vorgabe-Rechte: reine Rechnungen ohne Tabellenzugriff.

commit;
