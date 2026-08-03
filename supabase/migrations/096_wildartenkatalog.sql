-- 096_wildartenkatalog.sql — nativer Track, 03.08.2026
--
-- Schritte 2 UND 3 aus QuickHunt_Konzept_Wildartenkatalog_V1.md §11, bewusst in
-- EINER Datei. Erledigt zugleich Schritt 2 des Freigabemoduls (A-S7,
-- QuickHunt_Konzept_Freigabe_V1.md §4/§7: Taxonomietabelle Art -> Gruppe /
-- Klasse / Geschlecht). Es ist dieselbe Tabelle.
--
-- WARUM 2 UND 3 ZUSAMMEN, entgegen §11
-- Eine Spalte kills.wildart_id ohne ihren Trigger waere client-frei setzbar —
-- kills_reporter ist `for all` mit `using (reporter_id = auth.uid())` und ohne
-- eigenes `with check`. Genau das Muster, das 087 aufgeraeumt hat. Spalte und
-- Trigger gehoeren deshalb in dieselbe Migration; getrennt staende zwischen
-- beiden ein Zeitfenster, in dem der Client die Herkunft frei behauptet.
-- Zweig 3 der SELECT-Policy ("was ich gemeldet habe, darf ich lesen") braucht
-- kills.wildart_id ohnehin und kann so gleich mitentstehen.
--
-- Der erste Entwurf nahm zusaetzlich hunts.wildart_ids aus Schritt 5 mit, damit
-- die Policy einmal und vollstaendig entsteht. Die Fremdpruefung hat das
-- kassiert — die Begruendung steht unten an der Stelle, an der die Spalte
-- fehlt. Ergebnis: 096 ist jetzt exakt Schritt 2 + Schritt 3, nicht mehr.
--
-- DER TRIGGERNAME IST EIN KORREKTHEITSARGUMENT, KEINE KOSMETIK (§4)
-- BEFORE-ROW-Trigger feuern in alphabetischer Reihenfolge des TRIGGERnamens.
-- Auf kills stehen als BEFORE-ROW heute: trg_kills_herkunft,
-- trg_kills_set_drive_id, trg_kills_trichinen, trg_kills_updated. AFTER laufen
-- trg_kills_activity und trg_kills_sync_wild_event — sie spielen fuer die
-- Reihenfolge keine Rolle und standen im ersten Entwurf faelschlich in der
-- BEFORE-Liste (Schlusslesung, Punkt 9b). Der neue heisst trg_kills_katalog, weil
--     herkunft (h)  <  katalog (k)  <  trichinen (t)
-- Der naheliegende Name trg_kills_wildart sortierte HINTER trg_kills_trichinen.
-- set_trichinen_pflicht() prueft
--     if new.wild_art in ('keiler','bache','ueberlaeufer','frischling')
-- und setzt NUR true, nie false. Meldet der Client kuenftig wildart_id und
-- laesst wild_art weg, saehe Trichinen bei falscher Reihenfolge NULL, traefe
-- seinen Zweig nie — und trichinen_pflicht bliebe auf dem SPALTEN-DEFAULT
-- `false`. Lebensmittelrecht, und geraeuschlos. Wer diesen Trigger je umbenennt,
-- muss diese Zeilen gelesen haben.
--
-- WARUM DAS KONSTRUKT UEBERHAUPT TRAEGT (§8)
-- kills.wild_art ist NOT NULL. Der Client darf sie trotzdem weglassen, sobald er
-- wildart_id schickt: BEFORE-ROW-Trigger laufen VOR der Constraint-Pruefung. Das
-- ist der nicht offensichtliche Punkt des ganzen Entwurfs.
--
-- WARUM DER TRIGGER INVOKER IST — und damit anders als der aus 087
-- 087 begruendet SECURITY DEFINER damit, dass eine per RLS unsichtbare
-- hunts-Zeile aus einem Widerspruch lautlos ein "kein Widerspruch" gemacht
-- haette. Hier ist es umgekehrt: die Sichtbarkeitspruefung IST der Zweck des
-- Lookups. Als INVOKER wendet Postgres die SELECT-Policy auf wildarten von
-- selbst an; findet der Lookup nichts, wird geworfen (42501). Ein Nachbau der
-- Policy im Funktionsrumpf entfiele damit — und ein Nachbau, der irgendwann von
-- der Policy abweicht, waere die eigentliche Gefahr.
-- Das ist kein Schoenheitsargument, sondern schliesst ein Loch: Zweig 3 der
-- SELECT-Policy ("was ich gemeldet habe, darf ich lesen") wuerde sonst zum
-- Orakel — wer eine fremde private wildart-uuid in die Hand bekommt, legte eine
-- Erlegung darauf an und haette sich damit selbst das Leserecht verschafft.
-- Mit dem INVOKER-Lookup kann er die Zeile gar nicht erst referenzieren.
-- search_path ist trotzdem gesetzt und die Tabelle schema-qualifiziert, damit
-- `create temp table wildarten` nichts ueberschattet.
--
-- WAS DIE MIGRATION BEWUSST NICHT TUT
-- - Kein ALTER TYPE auf wild_art. Das Enum bleibt fuer immer bei 36 Werten (§3).
-- - Kein Backfill der 33 Alt-Erlegungen (§12). kills.wildart_id bleibt dort null,
--   wild_art gilt weiter — genau die Regel aus §8.
-- - hunts.wild_presets bleibt unangetastet (§10). Die PWA schreibt es weiter,
--   niemand liest es; als wild_art[] koennte es keine Katalogart tragen.
-- - Kein Katalog-FK fuer tracking_requests, game_meat_invoices, shooting_plans.
--
-- ZWEI ENTSCHEIDUNGEN, DIE DAS KONZEPT OFFEN LIESS
-- (a) `bejagdbar` ist im DDL von §5 nicht aufgefuehrt, §12 setzt die Spalte aber
--     als vorhanden voraus ("`bejagdbar` als Spalte haelt die Tuer auf"). Sie
--     kommt mit: der Katalog traegt laut §1 auch nicht-jagdbares Wild, und ohne
--     das Kennzeichen staende der Fischotter in der Erlegungssuche zwischen Reh
--     und Sau. false heisst "unterliegt in D keiner Jagdzeit" (ganzjaehrig
--     geschont oder nicht dem Jagdrecht unterliegend) — es ist eine Anzeige-
--     Eigenschaft, KEIN Riegel: melden wird nie verhindert, nur ausgewiesen.
-- (b) kills.wildart_id bekommt `on delete restrict`. Eine eigene Art, auf die
--     eine Erlegung zeigt, laesst sich damit nicht loeschen (23503). Der laute
--     Fehlschlag ist die richtige Haelfte des Tauschs; `on delete set null`
--     naehme dem Melder die genaue Art hinter seinem Ruecken weg. Folge fuer
--     Schritt 6: der Loeschen-Knopf braucht dort eine eigene Meldung.

-- ---------------------------------------------------------------- Katalog ---

create table if not exists public.wildarten (
  id                  uuid primary key default gen_random_uuid(),
  besitzer_id         uuid references auth.users(id) on delete cascade,  -- null = global
  schluessel          text,
  name                text not null,
  gruppe              text not null,
  geschlecht_implizit geschlecht,   -- null heisst "frag den Nutzer" (086er Semantik)
  enum_wert           wild_art,     -- null = kein Gegenstueck -> 'sonstiges'
  bejagdbar           boolean not null default true,
  -- Eigene Achse, NICHT aus `gruppe` abgeleitet. Der erste Entwurf haengte die
  -- Trichinenpflicht an gruppe = 'schwarzwild' — die Schlusslesung hat das
  -- zerlegt: `gruppe` ist laut diesem Dateikopf ein ICON-EIMER und
  -- ausdruecklich keine Taxonomie, und die Tier-LMHV nennt neben Wildschwein
  -- auch Dachs und Nutria. Nutria steht in dieser Migration erstmals im Seed
  -- und traegt gruppe = 'sonstiges' — sie waere durch den Rost gefallen.
  trichinenpflichtig  boolean not null default false,
  suchbegriffe        text[] not null default '{}',
  created_at          timestamptz not null default now(),

  constraint wildart_name_nicht_leer  check (btrim(name) <> ''),
  constraint wildart_gruppe_bekannt   check (gruppe in
    ('rehwild','schwarzwild','rotwild','damwild',
     'raubwild','hasenartig','federwild','sonstiges')),
  constraint wildart_global_braucht_schluessel
    check (besitzer_id is not null or schluessel is not null),
  -- §6, der Riegel: setzte ein Nutzer auf SEINER Art enum_wert = 'keiler',
  -- schriebe der Trigger kills.wild_art = 'keiler' — daran haengen die
  -- Trichinenpflicht, jede Streckenzaehlung und jeder kuenftige Kontingentzaehler.
  constraint wildart_eigen_ohne_enum
    check (besitzer_id is null or enum_wert is null),
  constraint wildart_implizit_nie_unbekannt
    check (geschlecht_implizit is null or geschlecht_implizit <> 'unbekannt')
);

-- Geteilte Eindeutigkeit statt globalem unique (§5): ein global eindeutiger
-- Schluessel hiesse, dass der erste Nutzer, der "sikawild" anlegt, alle anderen
-- mit einem 23505 blockiert, das im Formular als "unbekannter Fehler" ankommt.
create unique index if not exists wildarten_schluessel_global
  on public.wildarten (schluessel) where besitzer_id is null;
create unique index if not exists wildarten_name_eigen
  on public.wildarten (besitzer_id, lower(name)) where besitzer_id is not null;
-- Ohne den dritten koennten zwei globale Zeilen auf 'keiler' zeigen, und
-- "welche Katalogzeile gehoert zu dieser Alt-Erlegung" haette zwei Antworten.
create unique index if not exists wildarten_enum_wert_global
  on public.wildarten (enum_wert) where besitzer_id is null and enum_wert is not null;

-- --------------------------------------------------- Spalten an den Rest ---

-- hunts.wildart_ids ist hier BEWUSST NICHT dabei, obwohl der erste Entwurf sie
-- mitnahm, um die SELECT-Policy einmal und vollstaendig zu schreiben.
-- Die Fremdpruefung (Codex, 03.08.2026, Befund 2 von 2) hat gezeigt, dass genau
-- das ein Loch aufreisst: ein uuid[] ohne Fremdschluessel und ohne
-- Eigentumspruefung, das jeder Jagdersteller beschreiben darf, plus ein
-- Policy-Zweig, der daraus Leserecht ableitet — wer eine fremde private
-- wildarten.id kennt, traegt sie in seine EIGENE Jagd ein und liest die Zeile.
-- Dieselbe Wurzel wie 083: eine Berechtigung an etwas haengen, das der Nutzer
-- schreiben darf. Die Spalte gehoert zu Schritt 5, zusammen mit ihrem Schreiber
-- in create.tsx und der Pruefung, die jede eingetragene id gegen "global oder
-- gehoert dem Jagdleiter" haelt. Bis dahin traegt die Policy drei Zweige statt
-- vier; es fehlt keine Funktion, weil ohne Schritt 6 niemand eine eigene Art
-- anlegen kann, die freizugeben waere.

alter table public.kills
  add column if not exists wildart_id uuid
    references public.wildarten(id) on delete restrict;

-- Traegt Zweig 3 der SELECT-Policy unten.
create index if not exists kills_wildart_id_idx
  on public.kills (wildart_id) where wildart_id is not null;

-- -------------------------------------------------------------------- RLS ---

alter table public.wildarten enable row level security;

drop policy if exists wildarten_select on public.wildarten;
drop policy if exists wildarten_insert on public.wildarten;
drop policy if exists wildarten_update on public.wildarten;
drop policy if exists wildarten_delete on public.wildarten;

-- §7, die von Moritz entschiedene Fassung. NICHT die aus §6 (`using (true)`) —
-- die ist der Entwurf, den §7 ausdruecklich verwirft: ein geteilter Namensraum,
-- in den jeder schreiben darf, verkommt, und niemand raeumt ihn auf, weil er
-- niemandem gehoert.
-- DREI Zweige, nicht vier. Der Zweig "vom Jagdleiter freigegeben" faellt mit
-- hunts.wildart_ids in Schritt 5 an — siehe die Begruendung oben bei der
-- weggelassenen Spalte.
-- `to authenticated` bleibt trotzdem gesetzt: die Tabelle traegt nichts fuer den
-- Gast-Layer, und in Schritt 5 kommt der funktionsrufende Zweig zurueck. Fuer
-- anon wuerde daraus sonst ein hartes 42501 statt einer leeren Liste
-- (Projektregel, an map_objects und 077 gemessen).
create policy wildarten_select on public.wildarten
  for select to authenticated using (
    besitzer_id is null                              -- globaler Katalog
    or besitzer_id = auth.uid()                      -- meine eigenen
    or exists (                                      -- was ich gemeldet habe,
      select 1 from public.kills k                   -- darf ich auch lesen
       where k.wildart_id = wildarten.id
         and k.reporter_id = auth.uid()
    )
  );

-- Kommandogetrennt, nicht `for all` — Regel aus 073: eine for-all-Policy prueft
-- ihr USING auch gegen die NEUE Zeile.
-- Der zweite Riegel aus §6: niemand darf per PostgREST eine Zeile mit
-- besitzer_id is null anlegen. Globale Arten entstehen ausschliesslich per
-- Migration.
create policy wildarten_insert on public.wildarten
  for insert to authenticated with check (besitzer_id = auth.uid());
-- Das with check faengt beides ab: Aneignung nach global (= null) und
-- Verschieben in ein fremdes Konto. Ein Festhalte-Trigger wie in 085 ist hier
-- nicht noetig, weil das USING nicht weiter ist als das gewuenschte Schreibrecht.
create policy wildarten_update on public.wildarten
  for update to authenticated
  using (besitzer_id = auth.uid()) with check (besitzer_id = auth.uid());
create policy wildarten_delete on public.wildarten
  for delete to authenticated using (besitzer_id = auth.uid());

-- ---------------------------------------------------------------- Trigger ---

create or replace function public.set_kill_katalog()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_enum      wild_art;
  v_gruppe    text;
  v_trichinen boolean;
begin
  if tg_op = 'UPDATE' then
    -- §8.3: wildart_id steht nach dem INSERT fest — wie hunting_license_id,
    -- district_id, hunt_id (087) und erlegt_am (090).
    -- §8.2: und wild_art darf nicht vom Katalogwert wegdrehen, solange
    -- wildart_id gesetzt ist — kills_reporter ist `for all` ohne eigenes
    -- with check. Eine Zusicherung, ein Satz.
    if new.wildart_id is distinct from old.wildart_id
       or (new.wildart_id is not null and new.wild_art is distinct from old.wild_art)
    then
      raise exception 'Die Wildart einer Erlegung steht mit der Meldung fest'
        using errcode = 'insufficient_privilege';
    end if;
    -- Schlusslesung Befund 1: die Trichinenpflicht liess sich per UPDATE wieder
    -- abschalten. Fuer die vier ENUM-Schwarzwildwerte faengt das
    -- set_trichinen_pflicht() ab — es laeuft auch auf UPDATE und setzt erneut
    -- true. Eine KATALOG-Zeile ohne Enum-Gegenstueck traegt aber
    -- wild_art = 'sonstiges', wird dort nicht erkannt, und
    -- `PATCH /rest/v1/kills {"trichinen_pflicht": false}` als Melder ginge durch
    -- (kills_reporter ist `for all` ohne eigenes with check — Klasse 087).
    -- Katalog-Schwarzwild waere damit schlechter geschuetzt als Enum-Schwarzwild.
    -- Eine Sperrklinke statt eines Lookups: einmal gesetzt, bleibt gesetzt.
    -- Das spiegelt genau das Verhalten des Enum-Pfades und braucht kein SELECT
    -- auf wildarten — ein Lookup hier trafe fremde UPDATE-Pfade, die die Zeile
    -- gar nicht sehen muessen (trg_drives_backfill_kills aus 056 setzt drive_id
    -- als Jagdleiter, nicht als Melder). Genau der Fall, an dem 092 im Entwurf
    -- gescheitert waere.
    -- Das coalesce auf BEIDEN Seiten ist nicht Kosmetik (Delta-Durchgang, D2):
    -- kills.trichinen_pflicht ist NULLABLE mit Default false. Ohne die
    -- Normalisierung ergaebe `true and not NULL` den Wert NULL, das if feuerte
    -- nicht — und ein `PATCH {"trichinen_pflicht": null}` haette exakt das
    -- Ergebnis geliefert, das die Klinke verhindern soll, nur einen Wert weiter.
    if new.wildart_id is not null
       and coalesce(old.trichinen_pflicht, false)
       and not coalesce(new.trichinen_pflicht, false) then
      new.trichinen_pflicht := true;
    end if;
    return new;
  end if;

  if new.wildart_id is null then
    return new;   -- Alt-/PWA-Meldung: wild_art gilt unveraendert weiter (§8)
  end if;

  -- INVOKER: die SELECT-Policy oben ist die Pruefung. Siehe Kopf.
  select w.enum_wert, w.gruppe, w.trichinenpflichtig
    into v_enum, v_gruppe, v_trichinen
    from public.wildarten w
   where w.id = new.wildart_id;

  if not found then
    raise exception 'Diese Wildart gibt es nicht oder sie ist fuer dich nicht sichtbar'
      using errcode = 'insufficient_privilege';
  end if;

  -- §8.1: zuweisen, nicht vergleichen. Der Trigger wirft nicht bei Widerspruch,
  -- er ueberschreibt (Lehre aus 092).
  new.wild_art := coalesce(v_enum, 'sonstiges'::wild_art);

  -- Fremdpruefung (Codex, 03.08.2026, Befund 1 von 2). Die Trigger-REIHENFOLGE
  -- allein genuegt nicht — die Falle sitzt eine Ebene tiefer, im
  -- Informationsverlust der Abbildung:
  -- Eine SELBST angelegte Art muss enum_wert = NULL tragen (der CHECK
  -- wildart_eigen_ohne_enum), darf aber gruppe = 'schwarzwild' haben. Dann
  -- schreibt die Zeile darueber wild_art = 'sonstiges', set_trichinen_pflicht()
  -- prueft `new.wild_art in ('keiler','bache','ueberlaeufer','frischling')`,
  -- trifft nicht zu, setzt sein true nie — und trichinen_pflicht bliebe auf dem
  -- Spalten-Default false. Ein Lebensmittelrechtsfeld, geraeuschlos falsch,
  -- erzeugt durch eine voellig regulaere Eingabe.
  --
  -- ZWEI Bedingungen, und sie decken verschiedene Faelle ab — die zweite kam
  -- erst durch die Schlusslesung dazu (Befund 2):
  --   v_trichinen        — die rechtliche Achse, als Datum an der Katalogzeile.
  --                        Traegt Schwarzwild, Nutria, Dachs, Waschbaer und
  --                        Marderhund — gesetzt vom UPDATE am Dateiende, dort
  --                        auch zu streichen. Global, per Migration, vom
  --                        Nutzer nicht erreichbar.
  --   gruppe schwarzwild — der Auffang fuer SELBST angelegte Arten. Ihre Zeile
  --                        gehoert dem Nutzer, er koennte trichinenpflichtig
  --                        also auf false lassen; die Gruppe waehlt er beim
  --                        Anlegen aber ohnehin (Konzept §11 Schritt 6), und
  --                        wer sein Stueck als Schwarzwild einsortiert, bekommt
  --                        die Pflicht mit.
  -- Nur setzen, nie zuruecknehmen — die Sperrklinke im UPDATE-Zweig oben haelt
  -- das auch nach der Meldung.
  if coalesce(v_trichinen, false) or v_gruppe = 'schwarzwild' then
    new.trichinen_pflicht := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kills_katalog on public.kills;
create trigger trg_kills_katalog
  before insert or update on public.kills
  for each row execute function public.set_kill_katalog();

-- Nach dem CREATE TRIGGER, nicht davor: Postgres prueft EXECUTE auf die
-- Triggerfunktion beim ANLEGEN des Triggers, nicht beim Feuern (082).
-- Die Rollen muessen namentlich genannt werden — `from public` allein entzieht
-- bei Supabase gar nichts, weil ALTER DEFAULT PRIVILEGES sie explizit vergibt.
revoke execute on function public.set_kill_katalog()
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------- Seed ---
--
-- Die 36 bestehenden Enum-Werte plus 51 neue Arten (87 gesamt). §1 nannte
-- "~60-80"; die acht zusaetzlichen Enten, Gaense und Tauben sind Moritz'
-- Entscheidung vom 03.08.2026: "Ente" hatte eine einzige Art unter sich,
-- "Schwarzwild" dagegen vier — fuer einen Entenjaeger gab es nichts zu
-- favorisieren.
-- LANGNAMEN, nicht die gruppenrelativen aus WILD_ART_LABELS (§9): dort steht
-- "Hirsch" zweimal, "Kalb" und "Tier" ebenso — in einer flachen Trefferliste
-- sind sie mehrdeutig.
-- suchbegriffe tragen NUR die natuerlichen deutschen Nebenformen. Umlaut- und
-- Kleinschreibungsnormalisierung ist laut §9 Aufgabe der Suchfunktion im
-- Client; sie hier als ASCII-Dubletten mitzuschreiben waere eine zweite
-- Wahrheit, die beim ersten Tippfehler auseinanderlaeuft.
-- gruppe ist ein ICON-EIMER, keine Taxonomie (§2). Sikawild, Muffelwild und
-- Gamswild landen deshalb auf 'sonstiges' und nicht auf 'rotwild': das Icon
-- passte, die Streckenzaehlung waere falsch.

insert into public.wildarten
  (schluessel, name, gruppe, geschlecht_implizit, enum_wert, bejagdbar, suchbegriffe)
values
  -- --- die 36 bestehenden Enum-Werte -------------------------------------
  ('rehbock',            'Rehbock',                 'rehwild',     'maennlich', 'rehbock',            true,  array['bock','reh','rehwild']),
  ('ricke',              'Ricke',                   'rehwild',     'weiblich',  'ricke',              true,  array['reh','rehwild','geiß']),
  ('rehkitz',            'Rehkitz',                 'rehwild',     null,        'rehkitz',            true,  array['kitz','reh','rehwild']),
  ('bockkitz',           'Bockkitz',                'rehwild',     'maennlich', 'bockkitz',           true,  array['kitz','bock','reh','rehwild']),
  ('schmalbock',         'Schmalbock',              'rehwild',     'maennlich', 'schmalbock',         true,  array['bock','reh','rehwild','jährling']),
  ('schmalreh',          'Schmalreh',               'rehwild',     'weiblich',  'schmalreh',          true,  array['reh','rehwild','schmalricke']),
  ('rehwild_unspez',     'Rehwild',    'rehwild',     null,        'rehwild_unspez',     true,  array['reh','rehwild']),

  ('keiler',             'Keiler',                  'schwarzwild', 'maennlich', 'keiler',             true,  array['sau','schwein','wildschwein','schwarzwild','basse']),
  ('bache',              'Bache',                   'schwarzwild', 'weiblich',  'bache',              true,  array['sau','schwein','wildschwein','schwarzwild']),
  ('ueberlaeufer',       'Überläufer',              'schwarzwild', null,        'ueberlaeufer',       true,  array['sau','schwein','wildschwein','schwarzwild']),
  ('frischling',         'Frischling',              'schwarzwild', null,        'frischling',         true,  array['sau','schwein','wildschwein','schwarzwild']),
  ('schwarzwild_unspez', 'Schwarzwild','schwarzwild', null,        'schwarzwild_unspez', true,  array['sau','schwein','wildschwein','schwarzwild']),

  ('rothirsch',          'Rothirsch',               'rotwild',     'maennlich', 'rothirsch',          true,  array['hirsch','rotwild','geweih']),
  ('rottier',            'Rottier',                 'rotwild',     'weiblich',  'rottier',            true,  array['tier','rotwild','alttier']),
  ('rotkalb',            'Rotkalb',                 'rotwild',     null,        'rotkalb',            true,  array['kalb','rotwild']),
  ('schmaltier_rot',     'Rotschmaltier',           'rotwild',     'weiblich',  'schmaltier_rot',     true,  array['schmaltier','rotwild']),
  ('spiesser_rot',       'Rotspießer',              'rotwild',     'maennlich', 'spiesser_rot',       true,  array['spießer','rotwild']),
  ('rotwild_unspez',     'Rotwild',    'rotwild',     null,        'rotwild_unspez',     true,  array['rotwild','rothirsch']),

  ('damhirsch',          'Damhirsch',               'damwild',     'maennlich', 'damhirsch',          true,  array['hirsch','damwild','schaufler']),
  ('damtier',            'Damtier',                 'damwild',     'weiblich',  'damtier',            true,  array['tier','damwild']),
  ('damkalb',            'Damkalb',                 'damwild',     null,        'damkalb',            true,  array['kalb','damwild']),
  ('schmaltier_dam',     'Damschmaltier',           'damwild',     'weiblich',  'schmaltier_dam',     true,  array['schmaltier','damwild']),
  ('spiesser_dam',       'Damspießer',              'damwild',     'maennlich', 'spiesser_dam',       true,  array['spießer','damwild']),
  ('damwild_unspez',     'Damwild',    'damwild',     null,        'damwild_unspez',     true,  array['damwild','damhirsch']),

  ('fuchs',              'Fuchs',                   'raubwild',    null,        'fuchs',              true,  array['rotfuchs','reineke','raubwild']),
  ('dachs',              'Dachs',                   'raubwild',    null,        'dachs',              true,  array['grimbart','raubwild']),
  ('waschbaer',          'Waschbär',                'raubwild',    null,        'waschbaer',          true,  array['raubwild','neozoon']),
  ('marderhund',         'Marderhund',              'raubwild',    null,        'marderhund',         true,  array['enok','raubwild','neozoon']),

  ('hase',               'Feldhase',                'hasenartig',  null,        'hase',               true,  array['hase','niederwild']),
  ('wildkaninchen',      'Wildkaninchen',           'hasenartig',  null,        'wildkaninchen',      true,  array['kaninchen','karnickel','niederwild']),

  ('fasan',              'Fasan',                   'federwild',   null,        'fasan',              true,  array['federwild','niederwild']),
  ('ente',               'Ente',       'federwild',   null,        'ente',               true,  array['ente','wildente','federwild']),
  ('taube',              'Taube',      'federwild',   null,        'taube',              true,  array['taube','wildtaube','federwild']),
  ('gans',               'Gans',       'federwild',   null,        'gans',               true,  array['gans','wildgans','federwild']),
  ('kraehe',             'Krähe',      'federwild',   null,        'kraehe',             true,  array['krähe','rabenvogel','federwild']),

  ('sonstiges',          'Sonstiges',               'sonstiges',   null,        'sonstiges',          true,  array['unbekannt','sonstiges']),

  -- --- 51 neue Arten, alle ohne Enum-Gegenstueck -> kills.wild_art = 'sonstiges'
  -- Schalenwild ohne eigenen Icon-Eimer
  ('sikahirsch',         'Sikahirsch',              'sonstiges',   'maennlich', null, true,  array['sika','sikawild','hirsch']),
  ('sikatier',           'Sikatier',                'sonstiges',   'weiblich',  null, true,  array['sika','sikawild','tier']),
  ('sikakalb',           'Sikakalb',                'sonstiges',   null,        null, true,  array['sika','sikawild','kalb']),
  ('muffelwidder',       'Muffelwidder',            'sonstiges',   'maennlich', null, true,  array['muffel','muffelwild','mufflon','widder']),
  ('muffelschaf',        'Muffelschaf',             'sonstiges',   'weiblich',  null, true,  array['muffel','muffelwild','mufflon','schaf']),
  ('muffellamm',         'Muffellamm',              'sonstiges',   null,        null, true,  array['muffel','muffelwild','mufflon','lamm']),
  ('gamsbock',           'Gamsbock',                'sonstiges',   'maennlich', null, true,  array['gams','gamswild','gämse','gemse','bock']),
  ('gamsgeiss',          'Gamsgeiß',                'sonstiges',   'weiblich',  null, true,  array['gams','gamswild','gämse','gemse','geiß']),
  ('gamskitz',           'Gamskitz',                'sonstiges',   null,        null, true,  array['gams','gamswild','gämse','kitz']),
  ('elchwild',           'Elchwild',                'sonstiges',   null,        null, false, array['elch']),

  ('schneehase',         'Schneehase',              'hasenartig',  null,        null, true,  array['hase']),

  -- Raubwild
  ('steinmarder',        'Steinmarder',             'raubwild',    null,        null, true,  array['marder','raubwild']),
  ('baummarder',         'Baummarder',              'raubwild',    null,        null, true,  array['marder','edelmarder','raubwild']),
  ('iltis',              'Iltis',                   'raubwild',    null,        null, true,  array['raubwild']),
  ('hermelin',           'Hermelin',                'raubwild',    null,        null, true,  array['wiesel','raubwild']),
  ('mauswiesel',         'Mauswiesel',              'raubwild',    null,        null, true,  array['wiesel','raubwild']),
  ('mink',               'Mink',                    'raubwild',    null,        null, true,  array['nerz','neozoon','raubwild']),
  ('goldschakal',        'Goldschakal',             'raubwild',    null,        null, false, array['schakal']),
  ('wildkatze',          'Wildkatze',               'raubwild',    null,        null, false, array['katze']),
  ('luchs',              'Luchs',                   'raubwild',    null,        null, false, array['raubwild']),
  ('fischotter',         'Fischotter',              'raubwild',    null,        null, false, array['otter']),
  ('wolf',               'Wolf',                    'raubwild',    null,        null, false, array['raubwild']),

  -- Federwild
  ('rebhuhn',            'Rebhuhn',                 'federwild',   null,        null, true,  array['huhn','niederwild']),
  ('wachtel',            'Wachtel',                 'federwild',   null,        null, false, array['huhn']),
  ('auerhahn',           'Auerhahn',                'federwild',   'maennlich', null, false, array['auerwild','raufußhuhn']),
  ('birkhahn',           'Birkhahn',                'federwild',   'maennlich', null, false, array['birkwild','raufußhuhn']),
  ('ringeltaube',        'Ringeltaube',             'federwild',   null,        null, true,  array['taube']),
  ('tuerkentaube',       'Türkentaube',             'federwild',   null,        null, true,  array['taube']),
  ('stockente',          'Stockente',               'federwild',   null,        null, true,  array['ente']),
  ('krickente',          'Krickente',               'federwild',   null,        null, true,  array['ente']),
  ('pfeifente',          'Pfeifente',               'federwild',   null,        null, true,  array['ente']),
  ('schnatterente',      'Schnatterente',           'federwild',   null,        null, true,  array['ente']),
  ('reiherente',         'Reiherente',              'federwild',   null,        null, true,  array['ente','tauchente']),
  ('tafelente',          'Tafelente',               'federwild',   null,        null, true,  array['ente','tauchente']),
  ('graugans',           'Graugans',                'federwild',   null,        null, true,  array['gans']),
  ('blaessgans',         'Blässgans',               'federwild',   null,        null, true,  array['gans']),
  ('saatgans',           'Saatgans',                'federwild',   null,        null, true,  array['gans']),
  ('kanadagans',         'Kanadagans',              'federwild',   null,        null, true,  array['gans','neozoon']),
  ('nilgans',            'Nilgans',                 'federwild',   null,        null, true,  array['gans','neozoon']),
  ('blaesshuhn',         'Blässhuhn',               'federwild',   null,        null, true,  array['wasserhuhn']),
  ('waldschnepfe',       'Waldschnepfe',            'federwild',   null,        null, true,  array['schnepfe']),
  ('rabenkraehe',        'Rabenkrähe',              'federwild',   null,        null, true,  array['krähe','rabenvogel']),
  ('elster',             'Elster',                  'federwild',   null,        null, true,  array['rabenvogel']),
  ('eichelhaeher',       'Eichelhäher',             'federwild',   null,        null, true,  array['häher','rabenvogel']),
  ('kormoran',           'Kormoran',                'federwild',   null,        null, true,  array['wasservogel']),
  ('graureiher',         'Graureiher',              'federwild',   null,        null, true,  array['reiher','fischreiher']),
  ('maeusebussard',      'Mäusebussard',            'federwild',   null,        null, false, array['bussard','greifvogel']),
  ('rotmilan',           'Rotmilan',                'federwild',   null,        null, false, array['milan','greifvogel','gabelweihe']),

  -- Nager und Neozoen ohne Icon-Eimer
  ('nutria',             'Nutria',                  'sonstiges',   null,        null, true,  array['biberratte','neozoon']),
  ('bisam',              'Bisamratte',              'sonstiges',   null,        null, true,  array['bisam','neozoon']),
  ('biber',              'Biber',                   'sonstiges',   null,        null, false, array['nager'])
on conflict (schluessel) where besitzer_id is null do nothing;

-- ACHTUNG fuer spaetere Haende: `do nothing` heisst, dass eine KORREKTUR an
-- einer dieser Zeilen (Name, Gruppe, bejagdbar, Suchbegriffe) bei einem
-- erneuten Lauf still NICHT in der Datenbank ankommt. Das ist Absicht — der
-- Seed soll einen bestehenden Bestand nicht ueberschreiben —, aber es heisst
-- auch: wer eine Katalogzeile aendern will, braucht ein eigenes UPDATE, keine
-- Bearbeitung dieser Liste.

-- ------------------------------------------- Trichinenpflicht, rechtliche Liste
--
-- Als eigenes UPDATE statt als achte Spalte in 87 VALUES-Zeilen: die Liste ist
-- kurz, sie ist eine RECHTLICHE Aussage und keine Eigenschaft wie 'gruppe', und
-- sie gehoert an eine Stelle, an der man sie im Ganzen liest und aendert.
--
-- Grundlage: Tier-LMHV / VO (EU) 2015/1375 — untersuchungspflichtig sind
-- Wildschwein sowie weitere fuer Trichinen empfaengliche Arten; ausdruecklich
-- genannt werden Dachs und Nutria.
--
-- NEU GEGENUEBER HEUTE, und das ist eine bewusste Verhaltensaenderung:
-- set_trichinen_pflicht() deckt seit jeher NUR keiler/bache/ueberlaeufer/
-- frischling ab. Dachs, Waschbaer und Marderhund bekamen das Kennzeichen nie —
-- eine vorbestehende Luecke, die 096 fuer den Katalogpfad schliesst. Folge: ein
-- ueber den Katalog gemeldeter Dachs traegt kuenftig true, ein ueber die PWA
-- gemeldeter weiterhin false. Die Richtung ist die sichere — ein zu viel
-- gesetztes Kennzeichen kostet eine Untersuchung, ein fehlendes einen
-- Rechtsverstoss. Wer das anders will, streicht hier Zeilen.
update public.wildarten
   set trichinenpflichtig = true
 where besitzer_id is null
   and schluessel in ('keiler', 'bache', 'ueberlaeufer', 'frischling',
                      'schwarzwild_unspez',
                      'dachs', 'waschbaer', 'marderhund',
                      'nutria');
