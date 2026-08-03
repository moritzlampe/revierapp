-- 097_wildart_artachse.sql
-- Nativer Track, 03.08.2026. Ergaenzt 096.
--
-- WOFUER
-- ------
-- `wildarten.eltern_id` — die Artachse. Der Wildartenkatalog aus 096 ist eine
-- FLACHE Liste: „Schwarzwild", „Keiler", „Bache", „Ueberlaeufer" und
-- „Frischling" stehen darin gleichberechtigt nebeneinander. Fuer den Picker
-- unter „Sonstiges" ist das unbrauchbar — Moritz nach dem Geraetetest von
-- Schritt 1 am 03.08.2026: unter „Sonstiges" soll man erst das Tier durchgehen
-- und durch Antippen dessen Klassen bekommen, „es steht nicht ueberlaeufer
-- neben Rothirsch am ende des tages".
--
-- Das Wildartenkatalog-Konzept hat diese Spalte in §5 als „am laengsten
-- erwogenen Kandidaten" ZURUECKGESTELLT, mit einer ausdruecklichen Bedingung:
-- „Wenn das Kontingentformular sie liest, kommt sie — samt Leser, in derselben
-- Migration." Die Bedingung ist eingetreten, nur ueber einen anderen Leser als
-- erwartet: den Picker. Sie zahlt fuer A-S7 Schritt 3 mit ein, wo „Sikawild ->
-- alle Klassen" bis heute nicht ausdrueckbar ist.
--
-- WARUM DIE SAMMELZEILE DIE ELTERNZEILE IST
-- -----------------------------------------
-- Eine Fremdmeinung (Codex, 03.08.2026) schlug drei Spalten vor:
-- `art_schluessel`, `art_name`, `art_kategorie`. `art_name` schriebe den
-- Tiernamen auf JEDE Klassenzeile — eine zweite Wahrheit, die auseinanderlaeuft,
-- sobald jemand den Namen korrigiert. Genau das hat 086 an der abgeleiteten
-- Kuerzel-Spalte abgelehnt.
--
-- `schwarzwild_unspez` traegt Namen, Gruppe, Icon und Enum-Wert bereits. Sie IST
-- das Tier, und sie ist zugleich das „unbestimmt", das der Long-Press zaehlt.
-- Eine Spalte statt drei, kein neues Namenskonzept, keine Dublette.
--
-- WAS NICHT DAZUGEHOERT
-- ---------------------
-- **Sika, Muffel und Gams bekommen KEINE Elternzeile.** Moritz, 03.08.2026:
-- „das ist ja nicht eine familie. einfach getrennt." Ihre je drei Klassen
-- stehen als eigene Eintraege nebeneinander. Es kommt damit KEINE Seed-Zeile
-- hinzu; der Katalog bleibt bei 87.
--
-- **`art_kategorie` (Abschnitte „Schalenwild", „Federwild") bewusst nicht.**
-- Codex nannte sie im selben Atemzug als das, was er bei halber Zeit zuerst
-- streichen wuerde. Moritz' Einwand galt dem Mischen von EBENEN, nicht der
-- Reihenfolge. Alphabetisch plus Suchfeld genuegt.
--
-- **Kein Backfill an `kills`.** Die Spalte ist reine Darstellung; `kills`
-- kennt sie nicht und braucht sie nicht.
--
-- FOLGE FUER DIE OBERSTE EBENE
-- ----------------------------
-- 87 Zeilen minus 20 Kinder = 67 Eintraege auf der obersten Ebene.

begin;

-- ---------------------------------------------------------------------------
-- 1. Die Spalte
-- ---------------------------------------------------------------------------
--
-- Eine Elternzeile, an der Klassen haengen, laesst sich nicht wegloeschen —
-- sonst haetten die Kinder auf einmal keinen Ort mehr in der Liste.
--
-- **`no action deferrable initially deferred`, NICHT `restrict`, und das ist
-- der Unterschied zwischen einem Riegel und einem Ausfall** (Fremdpruefung
-- 03.08.2026, M6). `besitzer_id` haengt seit 096 mit `on delete cascade` an
-- `auth.users`: loescht jemand sein Konto, raeumt die Kaskade seine
-- Katalogzeilen ab. Besitzt er dabei eine eigene Elternzeile MIT eigenem Kind,
-- schlaegt ein sofortiges `restrict` mitten in dieser Kaskade zu, bevor das
-- Kind weg ist — die Kontoloeschung scheitert mit 23503, und genau die
-- personenbezogenen Daten, die verschwinden sollen, bleiben stehen.
-- `deferrable initially deferred` verschiebt die Pruefung an den COMMIT: dann
-- sind Eltern UND Kind fort, die Kaskade geht durch. Eine direkte Loeschung
-- einer Elternzeile mit Kindern scheitert weiterhin — nur spaeter.
alter table public.wildarten
  add column if not exists eltern_id uuid
    references public.wildarten(id) on delete no action deferrable initially deferred;

comment on column public.wildarten.eltern_id is
  'Artachse: zeigt auf die Sammelzeile des Tieres (z. B. schwarzwild_unspez). '
  'NULL = die Zeile steht selbst auf der obersten Ebene. Genau zwei Ebenen, '
  'erzwungen von wildart_eltern_pruefen().';

-- **Kein Index auf `eltern_id`, und das ist kein Versehen.** Serverseitig
-- fragt niemand danach: der Client laedt den ganzen Katalog in einer Abfrage
-- (`fetchWildarten`) und gruppiert im Speicher. 87 Zeilen. Ein Index waere die
-- Behauptung, es gaebe einen Leser, den es nicht gibt — faellig, wenn das
-- Kontingent aus A-S7 Schritt 3 ueber die Achse filtert.

-- Keine Selbstreferenz. Der Rest der Hierarchie braucht einen Lookup und
-- steht deshalb im Trigger — ein CHECK darf keine andere Zeile lesen.
alter table public.wildarten
  drop constraint if exists wildart_eltern_nicht_selbst;
alter table public.wildarten
  add constraint wildart_eltern_nicht_selbst check (eltern_id is null or eltern_id <> id);

-- ---------------------------------------------------------------------------
-- 2. Genau zwei Ebenen, und kein fremder Vater
-- ---------------------------------------------------------------------------
--
-- **Invoker, NICHT security definer, und das ist eine Entscheidung gegen ein
-- Orakel.** Als Invoker laeuft die Elternsuche durch RLS: zeigt jemand auf eine
-- private Zeile eines anderen Kontos, findet der Trigger sie nicht und lehnt
-- mit „gibt es nicht oder ist fuer dich nicht sichtbar" ab — dieselbe Antwort
-- wie fuer eine frei erfundene UUID. Ein SECURITY DEFINER haette hier
-- unterschieden und damit die Existenz fremder Zeilen bestaetigt.
--
-- Der Trigger laeuft VOR der Fremdschluesselpruefung (BEFORE ROW), sein „gibt
-- es nicht" kommt also auch dann zuerst, wenn die UUID real existiert.
--
-- **`search_path` steht trotzdem auf `public, pg_temp`**, obwohl die
-- pg_temp-Regel dem Wortlaut nach nur SECURITY DEFINER betrifft: als Invoker
-- koennte der Aufrufer sonst per `create temp table wildarten (…)` eine
-- gefaelschte Tabelle vorschieben und die Elternpruefung daran vorbeifuehren.
-- Mit `public` an erster Stelle gewinnt die echte Tabelle.
create or replace function public.wildart_eltern_pruefen()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_eltern_besitzer uuid;
  v_eltern_hat_eltern boolean;
begin
  if new.eltern_id is null then
    -- Oberste Ebene, der Normalfall. Kein Lock noetig: eine Zeile nach `null`
    -- zu schieben kann weder einen Zyklus noch eine dritte Ebene erzeugen.
    return new;
  end if;

  -- **Ohne diese Sperre sind beide Pruefungen unten zu umgehen**
  -- (Fremdpruefung 03.08.2026, M2). Sie lesen den Snapshot vom Anweisungsbeginn
  -- und sehen nichts, was eine parallele Transaktion gerade schreibt:
  --   T1 haengt C unter A (A ist oben -> erlaubt)
  --   T2 schiebt gleichzeitig A unter B (A hat noch keine Kinder -> erlaubt)
  -- Beide committen, drei Ebenen stehen da. Dieselbe Verschraenkung erzeugt mit
  -- A->B und B->A einen ZYKLUS, und der ist schlimmer: dann steht keine der
  -- beiden Zeilen mehr auf der obersten Ebene, beide verschwinden aus dem
  -- Picker, und eine rekursive Abfrage laeuft im Kreis.
  --
  -- **Bewusst NICHT `select ... for update` auf die Elternzeile**, wie die
  -- Fremdpruefung vorschlug — am 03.08.2026 gegen die Produktion gemessen:
  -- als `authenticated` liefert `select ... where schluessel='rehwild_unspez'`
  -- EINE Zeile, dasselbe `for update` KEINE. RLS zieht fuer sperrende SELECTs
  -- die UPDATE-Policy mit heran, und `wildarten_update` verlangt
  -- `besitzer_id = auth.uid()` — eine GLOBALE Elternzeile faellt durch. Der
  -- Riegel haette damit den legitimen Fall erschlagen (eigene Art unter ein
  -- globales Tier haengen), und zwar STILL: es filtert, es wirft nicht, landet
  -- also im `not found`-Zweig als „gibt es nicht".
  --
  -- **Sie traegt unter READ COMMITTED, nicht darueber** (Schlusslesung
  -- 03.08.2026). Erst dort holt sich der SELECT nach dem Warten einen frischen
  -- Snapshot und sieht den Commit der Gegenseite; unter REPEATABLE READ oder
  -- SERIALIZABLE behielte er den alten, und die Sperre serialisierte nur das
  -- Warten, nicht das Sehen. Heute nicht ausnutzbar — PostgREST faehrt READ
  -- COMMITTED, und ein Client kann die Stufe nicht waehlen. Wer spaeter ein
  -- Wartungsskript in hoeherer Isolation ueber die Hierarchie laufen laesst,
  -- muss es wissen.
  --
  -- ponytail: EINE Sperre fuer die ganze Tabelle, nicht je Zeile. Der Katalog
  -- hat 87 Zeilen und wird fast nie geschrieben; Hierarchieaenderungen
  -- serialisieren zu lassen kostet hier nichts. Feiner wird es, wenn eigene
  -- Arten (Schritt 6) zu einem haeufigen Schreibpfad werden.
  perform pg_advisory_xact_lock(hashtext('wildarten.eltern_id'));

  select w.besitzer_id, w.eltern_id is not null
    into v_eltern_besitzer, v_eltern_hat_eltern
    from public.wildarten w
   where w.id = new.eltern_id;

  -- `FOUND` setzt plpgsql nach jedem SELECT INTO selbst — ein eigenes
  -- Fundflag waere dieselbe Auskunft ein zweites Mal.
  if not found then
    raise exception 'Diese Wildart gibt es nicht oder sie ist fuer dich nicht sichtbar'
      using errcode = 'insufficient_privilege';
  end if;

  -- Genau zwei Ebenen, von oben gesehen.
  if v_eltern_hat_eltern then
    raise exception 'Eine Wildart kann nicht unter einer Klasse haengen'
      using errcode = 'check_violation';
  end if;

  -- Und von unten gesehen: wer selbst schon Klassen traegt, darf nicht
  -- seinerseits unter ein Tier wandern. Ohne diese Haelfte waeren drei Ebenen
  -- in zwei Schritten zu bauen (erst Kinder anlegen, dann Eltern verschieben),
  -- und der Picker verloere die Enkel lautlos.
  if exists (select 1 from public.wildarten k where k.eltern_id = new.id) then
    raise exception 'Diese Wildart traegt selbst Klassen und kann keiner anderen untergeordnet werden'
      using errcode = 'check_violation';
  end if;

  -- Global oder eigen. Eine private Zeile unter das Tier eines FREMDEN Kontos
  -- zu haengen ist durch den Invoker-Lookup oben schon ausgeschlossen; diese
  -- Bedingung faengt den Rest ab, insbesondere eine globale Zeile unter einer
  -- privaten.
  --
  -- **Sie deckt nur die KIND-Seite, und das gehoert hierhin statt in eine
  -- Behauptung** (Schlusslesung 03.08.2026): wechselt der Besitzer einer Zeile,
  -- die selbst Kinder TRAEGT, steigt der Trigger oben beim `null`-Frueh-
  -- ausstieg aus, und die Kinder haengen danach unter einem fremden Besitzer.
  -- Fuer `authenticated` unerreichbar — `wildarten_update` verlangt
  -- `besitzer_id = auth.uid()` in USING UND WITH CHECK, ein Besitzerwechsel
  -- ist dort keiner. Erreichbar nur fuer `service_role`/`postgres`, und gegen
  -- die waere ein Trigger Theater: wer die Rechte hat, kann ihn abschalten.
  -- Also ehrlich benannt statt scheinbar verriegelt. Faellig zusammen mit
  -- Schritt 6, wenn eigene Arten wirklich entstehen.
  if v_eltern_besitzer is not null and v_eltern_besitzer is distinct from new.besitzer_id then
    raise exception 'Eine Wildart kann nur unter einer globalen oder einer eigenen Art haengen'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Es gibt bisher keinen Trigger auf `wildarten` (gemessen 03.08.2026), die
-- alphabetische Reihenfolge spielt hier also noch keine Rolle. Der Name folgt
-- trotzdem dem Schema aus 096, damit ein spaeterer zweiter Trigger sich
-- bewusst davor oder dahinter einsortieren muss.
drop trigger if exists trg_wildarten_eltern on public.wildarten;
create trigger trg_wildarten_eltern
  before insert or update of eltern_id, besitzer_id on public.wildarten
  for each row execute function public.wildart_eltern_pruefen();

-- Die Funktion gehoert niemandem ausser dem Trigger. `REVOKE … FROM PUBLIC`
-- allein entzieht bei Supabase GAR NICHTS — die drei Rollen muessen namentlich
-- genannt werden (AGENTS.md, gemessen 31.07.2026 an stand_ist_belegt()).
-- Postgres prueft EXECUTE beim ANLEGEN des Triggers, nicht beim Feuern (082),
-- der Trigger oben laeuft danach also weiter.
revoke all on function public.wildart_eltern_pruefen() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Rueckfuellung: 20 Klassen unter ihre 4 Sammelzeilen
-- ---------------------------------------------------------------------------
--
-- **Paarweise ausgeschrieben statt aus `gruppe` abgeleitet, und das ist
-- Absicht.** `gruppe` ist ein ICON-Eimer, keine Taxonomie — derselbe Dateikopf
-- von 096 sagt das, und die Trichinen-Falle desselben Tages ist der Beleg: eine
-- Bedeutung an `gruppe` zu haengen war dort der Fehler, obwohl es fuer den
-- damaligen Bestand zufaellig funktionierte. Fuer diese vier Familien faellt
-- `gruppe` zwar mit der Art zusammen — aber eine spaeter ergaenzte Zeile mit
-- `gruppe = 'schwarzwild'` wuerde bei einem Replay stillschweigend mit
-- eingesammelt.
--
-- Nur globale Zeilen (`besitzer_id is null` auf BEIDEN Seiten): eine eigene
-- Art eines Nutzers wird hier nicht angefasst.
update public.wildarten k
   set eltern_id = e.id
  from public.wildarten e,
       (values
         ('rehbock',        'rehwild_unspez'),
         ('ricke',          'rehwild_unspez'),
         ('rehkitz',        'rehwild_unspez'),
         ('bockkitz',       'rehwild_unspez'),
         ('schmalbock',     'rehwild_unspez'),
         ('schmalreh',      'rehwild_unspez'),
         ('keiler',         'schwarzwild_unspez'),
         ('bache',          'schwarzwild_unspez'),
         ('ueberlaeufer',   'schwarzwild_unspez'),
         ('frischling',     'schwarzwild_unspez'),
         ('rothirsch',      'rotwild_unspez'),
         ('rottier',        'rotwild_unspez'),
         ('rotkalb',        'rotwild_unspez'),
         ('schmaltier_rot', 'rotwild_unspez'),
         ('spiesser_rot',   'rotwild_unspez'),
         ('damhirsch',      'damwild_unspez'),
         ('damtier',        'damwild_unspez'),
         ('damkalb',        'damwild_unspez'),
         ('schmaltier_dam', 'damwild_unspez'),
         ('spiesser_dam',   'damwild_unspez')
       ) as paar(kind, elternteil)
 where k.schluessel = paar.kind
   and e.schluessel = paar.elternteil
   and k.besitzer_id is null
   and e.besitzer_id is null
   and k.eltern_id is distinct from e.id;

commit;

-- ---------------------------------------------------------------------------
-- Gegenproben (NACH dem Applizieren, Anker 2)
-- ---------------------------------------------------------------------------
--
-- G1  Genau 20 Kinder, genau 4 Eltern, 67 auf der obersten Ebene:
--       select count(*) filter (where eltern_id is not null) as kinder,
--              count(distinct eltern_id)                     as eltern,
--              count(*) filter (where eltern_id is null)     as oberste
--         from public.wildarten where besitzer_id is null;
--       -- erwartet: 20 | 4 | 67
--
-- G2  Jede Familie vollstaendig, keine Waise:
--       select e.name, count(*) from public.wildarten k
--         join public.wildarten e on e.id = k.eltern_id
--        group by e.name order by 1;
--       -- erwartet: Damwild 5 | Rehwild 6 | Rotwild 5 | Schwarzwild 4
--
-- G3  Sika, Muffel, Gams stehen weiter oben (Moritz' Entscheidung):
--       select name from public.wildarten
--        where schluessel in ('sikahirsch','sikatier','sikakalb',
--                             'muffelwidder','muffelschaf','muffellamm',
--                             'gamsbock','gamsgeiss','gamskitz')
--          and eltern_id is not null;
--       -- erwartet: 0 Zeilen
--
-- G4  Keine dritte Ebene im Bestand:
--       select count(*) from public.wildarten k
--         join public.wildarten e on e.id = k.eltern_id
--        where e.eltern_id is not null;
--       -- erwartet: 0
--
-- G5  Als `authenticated`: eigene Art unter eine globale haengen geht,
--     unter eine Klasse nicht, unter eine erfundene UUID nicht.
--       begin; set local role authenticated;
--       set local "request.jwt.claim.sub" = '<heinrich-uuid>';
--         insert into public.wildarten (besitzer_id, name, gruppe, eltern_id)
--         values (auth.uid(), 'Testsika', 'sonstiges',
--                 (select id from public.wildarten where schluessel='rehwild_unspez'));
--         -- erwartet: geht durch (Positivkontrolle)
--         insert into public.wildarten (besitzer_id, name, gruppe, eltern_id)
--         values (auth.uid(), 'Testsika2', 'sonstiges',
--                 (select id from public.wildarten where schluessel='keiler'));
--         -- erwartet: 23514 „kann nicht unter einer Klasse haengen"
--         insert into public.wildarten (besitzer_id, name, gruppe, eltern_id)
--         values (auth.uid(), 'Testsika3', 'sonstiges', gen_random_uuid());
--         -- erwartet: 42501 „gibt es nicht oder ist fuer dich nicht sichtbar"
--       rollback;
--
-- G6  Drei Ebenen in zwei Schritten (der Fall, den die zweite Haelfte des
--     Triggers abfaengt): eigene Art A anlegen, eigene Art B unter A haengen,
--     dann A unter eine globale Zeile schieben.
--       -- erwartet beim dritten Schritt: 23514 „traegt selbst Klassen"
--
-- G7  Eine Elternzeile mit Kindern laesst sich nicht loeschen. **Der FK ist
--     DEFERRED — ohne `set constraints all immediate` wuerde der Test nichts
--     beweisen**, weil die Pruefung erst am COMMIT liefe und das ROLLBACK ihr
--     zuvorkaeme:
--       begin;
--         delete from public.wildarten where schluessel = 'schwarzwild_unspez';
--         set constraints all immediate;
--       rollback;
--       -- erwartet: 23503 (foreign_key_violation) beim SET CONSTRAINTS
--
-- G7b Die Konto-Kaskade geht trotzdem durch (der M6-Fall): eigene Elternzeile
--     mit eigenem Kind anlegen, dann den auth.users-Eintrag loeschen.
--       -- erwartet: beide Zeilen weg, kein 23503. NUR gegen ein Wegwerf-Konto,
--       -- mit ROLLBACK, niemals gegen ein echtes.
--
-- G7c Nebenlaeufigkeit (der M2-Fall), zwei Sitzungen:
--       Sitzung 1: begin; insert eigene Art C mit eltern_id = A;   -- haelt die Sperre
--       Sitzung 2: begin; update eigene Art A set eltern_id = B;   -- blockiert
--       Sitzung 1: commit;  Sitzung 2 laeuft weiter
--       -- erwartet: Sitzung 2 scheitert mit 23514 „traegt selbst Klassen"
--
-- G8  `anon` liest `wildarten` weiter als ZAHL, nicht als Fehler
--     (Policy ruft keine Funktion, darf also nicht kippen):
--       begin; set local role anon; select count(*) from public.wildarten; rollback;
--
-- G9  EXECUTE auf die Triggerfunktion ist allen drei Rollen entzogen,
--     der Trigger feuert trotzdem (082):
--       select has_function_privilege('anon',          'public.wildart_eltern_pruefen()', 'EXECUTE'),
--              has_function_privilege('authenticated', 'public.wildart_eltern_pruefen()', 'EXECUTE'),
--              has_function_privilege('service_role',  'public.wildart_eltern_pruefen()', 'EXECUTE');
--       -- erwartet: f | f | f
--
-- G10 Keine SECURITY-DEFINER-Funktion ohne pg_temp (Bestandspruefung):
--       select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.prosecdef
--          and coalesce(array_to_string(p.proconfig,','),'') not like '%pg_temp%';
--       -- erwartet: 0 Zeilen
--
-- G11 Brockwinel unberuehrt: 33 Erlegungen vorher wie nachher.
