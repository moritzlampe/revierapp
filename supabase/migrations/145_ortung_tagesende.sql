-- 145: Push zum Ende der Jagdzeit "Fuer heute abmelden?" (CN-427).
--
-- ANLASS: Moritz am 27.10.2026, nach dem Geraetetest von Build 56: "wenn die
-- jagd mit einer zeit von zb 07-17 uhr angelegt ist sollte um 17 uhr der push
-- kommen ob man die ortung deaktivieren will oder nicht". Am 28.10.2026
-- nachgeschaerft: die Push kommt 30 min NACH dem Ende der Jagdzeit ("17.30
-- fuer einen kleinen puffer").
-- Bauplan (F14 geprueft, FREIGEGEBEN Fassung 3, 28.10.2026):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Ortung_Tagesende_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/145_ortung_tagesende.md
-- Gegenstueck zu 144 (morgens "Ortung noch aus"); Jagdzeiten, Zeitplan und
-- Route sind dieselben.
--
--
-- DIE REGEL IN FUENF SAETZEN
--
-- 1. Jedes Fenster {von, bis} aus `hunts.jagdzeiten` (144) ergibt je
--    Beginntag `d` (Berliner Datum) eine Instanz von `d + von` bis
--    `d + bis` bzw. `d + 1 + bis` ueber Mitternacht. Gerechnet wird mit Datum
--    plus Uhrzeit, nie mit `interval '24 hours'` (Zeitumstellung). Eine
--    Instanz mit `ende <= beginn` zaehlt nicht: das gibt es nur fuer ein
--    Fenster ganz in der uebersprungenen Fruehjahrsstunde (Bauplan E1, Codex
--    Delta 2).
-- 2. Instanzen, die sich ueberlappen oder beruehren, bilden eine STRECKE
--    (Ketten 22-07/07-17, Ueberlappung, 07-17/17-20). Ihr Ende zaehlt fuer
--    den Beginntag ihrer ERSTEN Instanz. Bauplan E1 sagte „ein verdecktes
--    Ende ist kein Tagesende" und rechnete jedes Ende seiner EIGENEN Instanz
--    zu; bei 07-17/18-02/01-03 fiel damit das Nachtende 03:00 ganz heraus,
--    und um 17:30 kam „Jagdzeit vorbei" vor dem Abendfenster (Codex M1,
--    Punkt 1). Fuer alle Zeilen der E1-Tabelle liefern beide Fassungen
--    dasselbe `E`.
-- 3. Das TAGESENDE eines Beginntags ist das spaeteste Ende seiner Strecken.
--    ERST dieser Schritt, DANN der Vergleich mit `jetzt` (zweistufig, sonst
--    waere bei 07-10/14-17 um 12:00 das Ende 10:00, Schlusslesung F1).
-- 4. `ortung_faelliges_tagesende()` liefert das juengste Tagesende `E <=
--    jetzt` der Beginntage heute, gestern, vorgestern; die Strecken werden
--    aus den Instanzen von vorvorgestern bis morgen gebildet. Die App rechnet
--    die Regel NICHT nach (Bauplan E6): das Tagesende kommt mit der Push.
-- 5. `ortung_tagesende_beanspruchen()` beansprucht in EINEM UPDATE jedes
--    faellige `E` hoechstens einmal (`ortung_tagesende_erinnert_fuer`).
--    Faellig ist `E` von `E + 30 min` bis `E + 60 min` (Bauplan E2): `E`
--    wird gegen `p_jetzt - 30 min` gerechnet und muss juenger sein als
--    `p_jetzt - 60 min`. Aufrufen darf sie NUR `service_role` (die Route
--    `/api/push/ortung`, derselbe Coolify-Zeitplan wie 144).
--
--
-- WER DIE PUSH BEKOMMT (Bauplan E2, alles im WHERE des UPDATE): laufende
-- Jagd mit Jagdzeiten; Teilnahme `joined` mit Konto; Ortung AN
-- (`ortung_pausiert_seit is null`); Einwilligung nicht `none`; ein Live-Punkt
-- (`positions_current.updated_at`) ab `E - 24 h` -- wer zugesagt, die Jagd
-- aber nie geoeffnet hat, bekommt kein "Deine Ortung ist noch an"; und `E`
-- nach `greatest(started_at, joined_at)`. Sind beide NULL, faellt die Zeile
-- still heraus (im Bestand 0, Bauplan M11, benannt statt abgesichert).
-- `scheduled_until` spielt KEINE Rolle (Bauplan E3 b, Moritz 28.10.2026):
-- das Termin-Ende beendet die Jagd nicht (CN-109).
--
-- WARUM EINE EIGENE SPALTE (Bauplan E4): zwei unabhaengige Ansprueche mit
-- eigenen Wiederholungen. Getrennt lassen sie sich getrennt zuruecksetzen und
-- lesen, und ein Fehler an der einen Art kann die andere nicht beruehren.
--
-- WARUM `E` IN EINEM LATERAL STEHT: `E` haengt nur an der JAGD-Zeile
-- (`h.jagdzeiten`) und `p_jetzt`, nie an der Teilnahme. Jede Bedingung an
-- der Teilnahme steht dagegen im WHERE selbst (wie 144, Codex M1 Punkt 3):
-- wartet das UPDATE an der Zeilensperre, wertet Postgres sie gegen die NEUE
-- Zeile aus. Wer im selben Augenblick abmeldet oder `consent = 'none'`
-- setzt, faellt heraus.
--
-- GENAU EINMAL BEANSPRUCHT, VORWAERTS (Bauplan E4): ein zweiter Lauf findet
-- `marke < E` falsch. Verlaengert der Jagdleiter das Ende nach der Push
-- (07-17 -> 07-19), ist das neue `E` groesser und wird erneut beansprucht --
-- gewollt. ZUGESTELLT wird nicht genau einmal: scheitert der Versand, setzt
-- die Route per Compare-and-Swap auf `E - 1 ms` zurueck (nicht NULL, wie 144).
-- Hingenommen: gewinnt das Beanspruchen die Zeilensperre gegen ein
-- gleichzeitiges Abmelden, geht die Push trotzdem hinaus; die App prueft beim
-- Tipp den aktuellen Stand (Bauplan E6). Ebenso hingenommen (Codex M1,
-- Punkt 3): `hunts` und `positions_current` bleiben nach einer
-- Sperrwartezeit im Stand vom Anweisungsbeginn — eine in dieser Sekunde
-- verlaengerte Jagdzeit kann die Push zum alten Ende noch ausloesen. Auch
-- das faengt die App beim Tipp ab (`jagdzeitVorbei`).
--
-- `ortung_tagesende_erinnert_fuer` ist wie `ortung_erinnert_fuer` von
-- Jagdleiter und Ersteller schreibbar (`participants_leader_all`,
-- `participants_creator_all`) -- schlimmstenfalls eine Push mehr oder
-- weniger. Gehoert zu CN-198.
--
--
-- SPERREN: nur `hunt_participants` (ADD COLUMN, kurz ACCESS EXCLUSIVE).
-- Applizieren, wenn keine Jagd laeuft.
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -X -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" \
--        -c "set statement_timeout = '120s'" -f 145_ortung_tagesende.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- Reihenfolge: 145 VOR der Route (sie ruft die neue Funktion). Die App liest
-- keine neue Spalte und braucht 145 nicht.

begin;

-- 1. Teilnahme: fuer welches Tagesende zuletzt beansprucht wurde ---------------

alter table public.hunt_participants
  add column ortung_tagesende_erinnert_fuer timestamptz;

comment on column public.hunt_participants.ortung_tagesende_erinnert_fuer is
  'CN-427 (145): Tagesende E, fuer das zuletzt eine Push "Jagdzeit vorbei, Ortung noch an" beansprucht wurde. Setzt ortung_tagesende_beanspruchen(); nach einem Fehlschlag setzt die Route auf E - 1 ms zurueck. NULL = nie.';

-- 2. Die Regel: das juengste erreichte Tagesende -------------------------------

create or replace function public.ortung_faelliges_tagesende(
  p_jagdzeiten jsonb,
  p_jetzt      timestamptz
)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  -- n = Versatz des Beginntags zu heute: -3 (vorvorgestern) bis 1 (morgen)
  with tag as (
    select (p_jetzt at time zone 'Europe/Berlin')::date + n as d, n
      from generate_series(-3, 1) n
  ),
  instanz as (
    select t.n,
           (t.d + (e ->> 'von')::time) at time zone 'Europe/Berlin' as beginn,
           ((t.d + case when (e ->> 'bis')::time < (e ->> 'von')::time
                        then 1 else 0 end)
             + (e ->> 'bis')::time) at time zone 'Europe/Berlin' as ende
      from tag t
     cross join jsonb_array_elements(p_jagdzeiten) e
  ),
  gueltig as (
    select * from instanz where ende > beginn
  ),
  -- Lücken und Inseln: eine neue Strecke beginnt, wo der Beginn hinter dem
  -- spätesten Ende aller früheren Instanzen liegt. Berühren verbindet (`<=`).
  insel as (
    select n, beginn, ende,
           sum(neu) over (order by beginn, ende rows unbounded preceding) as nr
      from (select g.*,
                   case when g.beginn <= max(g.ende) over (order by g.beginn, g.ende
                                                          rows between unbounded preceding and 1 preceding)
                        then 0 else 1 end as neu
              from gueltig g) x
  ),
  -- je Strecke ihr Ende, gezählt für den Beginntag ihrer ERSTEN Instanz
  strecke as (
    select (array_agg(n order by beginn, ende))[1] as n, max(ende) as ende
      from insel
     group by nr
  ),
  tagesende as (
    select n, max(ende) as ende
      from strecke
     group by n
  )
  select max(ende)
    from tagesende
   where n between -2 and 0
     and ende <= p_jetzt;
$$;

comment on function public.ortung_faelliges_tagesende(jsonb, timestamptz) is
  'CN-427 (145): juengstes Tagesende E <= p_jetzt (Beginntage heute, gestern, vorgestern, Berliner Datum): je Beginntag das spaeteste Ende der Strecken (ueberlappende oder beruehrende Fenster-Instanzen), die an ihm beginnen. NULL ohne Jagdzeiten. Nur service_role. Bauplan Ortung_Tagesende E1, Codex M1.';

-- 3. Beanspruchen: genau einmal je Tagesende -----------------------------------

create or replace function public.ortung_tagesende_beanspruchen(
  p_jetzt timestamptz default now()
)
returns table (user_id uuid, hunt_id uuid, jagdname text, tagesende timestamptz)
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  -- ⚠ Jede Teilnahme-Bedingung steht in DIESEM WHERE (s. Kopf, "WARUM `E`
  -- IN EINEM LATERAL STEHT").
  update public.hunt_participants hp
     set ortung_tagesende_erinnert_fuer = x.e
    from public.hunts h
   cross join lateral (
     select public.ortung_faelliges_tagesende(
              h.jagdzeiten, p_jetzt - interval '30 minutes') as e
   ) x
   where hp.hunt_id = h.id
     and h.status = 'active'
     and h.jagdzeiten is not null
     and hp.status = 'joined'
     and hp.user_id is not null
     and hp.ortung_pausiert_seit is null
     and hp.position_consent is distinct from 'none'
     and x.e > p_jetzt - interval '60 minutes'
     and x.e > greatest(h.started_at, hp.joined_at)
     and exists (select 1
                   from public.positions_current pc
                  where pc.participant_id = hp.id
                    and pc.updated_at >= x.e - interval '24 hours')
     and (hp.ortung_tagesende_erinnert_fuer is null
          or hp.ortung_tagesende_erinnert_fuer < x.e)
  returning hp.user_id, hp.hunt_id, h.name, hp.ortung_tagesende_erinnert_fuer;
$$;

comment on function public.ortung_tagesende_beanspruchen(timestamptz) is
  'CN-427 (145): beansprucht je laufender Jagd und Teilnehmer mit Ortung an und Live-Punkt das Tagesende E (30 bis 60 min alt) und gibt die Empfaenger zurueck. Nur service_role (PWA-Route /api/push/ortung). p_jetzt nur fuer Proben.';

-- Neue Funktionen bekommen per ALTER DEFAULT PRIVILEGES EXECUTE an anon,
-- authenticated und service_role -- ein REVOKE FROM PUBLIC allein entzoege
-- nichts (AGENTS.md, "Migrationen").
revoke execute on function public.ortung_tagesende_beanspruchen(timestamptz)
  from public, anon, authenticated;
grant execute on function public.ortung_tagesende_beanspruchen(timestamptz)
  to service_role;
-- Die Regel ebenso (Codex M1, Punkt 5): sie verarbeitet jede uebergebene
-- Liste ohne Grenze (fuenf Tage Instanzen je Eintrag, sortiert), und ein
-- direkter Aufruf ist an keinen CHECK gebunden — `anon` koennte ihr eine
-- beliebig lange Liste geben. Der einzige Aufrufer ist
-- `beanspruchen` (INVOKER, also mit den Rechten von `service_role`); kein
-- CHECK und keine Policy braucht sie. Bauplan E4 sah die Vorgabe-Rechte vor.
revoke execute on function public.ortung_faelliges_tagesende(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ortung_faelliges_tagesende(jsonb, timestamptz)
  to service_role;

commit;
