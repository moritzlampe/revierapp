-- 112_standgruppen.sql
-- Nativer Track, 10.08.2026. Setzt `districts` (001) und `map_objects` voraus.
-- Konzept: quickhunt-native/docs/konzepte/QuickHunt_Konzept_Standgruppen_V1.md
--
-- WOFUER
-- ------
-- Benannte, wiederverwendbare Standmengen am Revier. Moritz, 10.08.2026:
-- „normalerweise planen leute die drueckjagden machen feste treiben und die
-- machen sie jedes jahr erneut, ggf mit gewissen anpassungen" und „mehrere
-- staende schon im revier zu 'schuetzenreihen' anlegen und speichern, die
-- koennte ich jetzt anklicken, wie z.B. 'Sehl-Trift'".
--
-- Der Bestand belegt die Erwartung: in Soeder heissen vier Treiben „Sauberg"
-- (52 Staende), „Buchberg" (38), „Betonstrasse" (39), „Dornenbuesche" (43).
-- Das sind Reviergeografien, keine Tagesereignisse.
--
-- „Schuetzenreihe" und „Treiben-Vorlage" sind dieselbe Sache in zwei Groessen —
-- „Sehl-Trift" mit 6 Staenden und „Sauberg" mit 52 unterscheiden sich in nichts
-- ausser der Anzahl. Deshalb EINE Tabelle, und beim Zusammenstellen eines
-- Treibens lassen sich beliebig viele Gruppen additiv antippen.
--
--
-- WARUM NICHT `hunt_drives` — DER LOCK BLEIBT ZU
-- ----------------------------------------------
-- `QuickHunt_Konzept_Treiben_V1.md` §1 ist GELOCKT (06.07.2026): „Treiben =
-- benannte Standauswahl PRO JAGD". §9 desselben Dokuments fuehrt
-- „Treiben-Vorlagen/Copy" aber ausdruecklich als VERTAGT, nicht als verworfen.
--
-- Diese Migration fasst `hunt_drives` und `hunt_drive_stands` deshalb NICHT an.
-- Die Standgruppe ist eine zweite, additive Entitaet — kein Lock muss geoeffnet
-- werden, und keine Tabelle mit zwei Triggern und zwei Schreibpfaden wird
-- umgebaut.
--
-- `hunt_drives` KANN auch keine Vorlage sein. An der Produktion gemessen:
--   * `hunt_id` ist NOT NULL mit ON DELETE CASCADE
--   * `kills.drive_id -> hunt_drives` ON DELETE SET NULL
--   * zwei AFTER-UPDATE-Trigger: `trg_drives_backfill_kills`,
--     `trg_clear_stand_bezug_on_drive_end`
--   * Spalten `status`, `started_at`, `ended_at`
-- Die Tabelle ist ein EREIGNIS: ein Treiben lief von X bis Y, darin fielen
-- diese Erlegungen. Eine Vorlage hat kein Ende, keinen Status, keine
-- Erlegungen. Ein `district_id` danebenzusetzen presste zwei Lebenszyklen in
-- eine Tabelle — dieselbe Falle, die 110 bei `kills` vermieden hat.
--
-- ZWEI ZAHLEN, damit die Begruendung auf dem richtigen Bein steht (gemessen
-- 10.08.2026): `kills.drive_id` ist in 0 Erlegungen gesetzt, und
-- `hunt_drives.polygon` in 0 von 11 Zeilen — `polygon` wird zudem in KEINEM
-- der beiden Repos je geschrieben. Das Erlegungs-Argument traegt heute also
-- NICHT. Tragend sind Status und Trigger.
--
--
-- ZWEI TABELLEN STATT EINER `uuid[]`-SPALTE
-- -----------------------------------------
-- Der billige Weg waere `standgruppen.map_object_ids uuid[]`, mit
-- Praezedenzfall im eigenen Schema (`profiles.wildart_favoriten`, 101;
-- `hunts.wild_presets`).
--
-- Er scheitert an einem Satz, den 101 SELBST aufgeschrieben hat: die
-- Last-Write-Wins-Entscheidung darf nicht dorthin mitwandern, wo mehrere
-- Menschen dieselbe Zeile schreiben. Ein Ganzwert-Update auf ein Array
-- verliert bei Nebenlaeufigkeit still eine Aenderung. Bei einer persoenlichen
-- Kachel-Vorliebe ist der Preis eine fehlende Kachel; hier waere es ein
-- fehlender Stand in einer Vorlage, die ein Jahr spaeter benutzt wird.
--
-- Und der Mehrschreiber-Fall ist geplant, nicht hypothetisch: Moritz hat am
-- 10.08.2026 ausdruecklich „nur der besitzer und spaeter weitere jagdleiter"
-- als Schreiber vorgesehen. Kindzeilen erlauben ein Diff wie `standDiff()` im
-- Portal, ein Array erlaubt es nicht.
--
-- Zweiter Grund, kleiner aber echt: ein Kind-Fremdschluessel auf `map_objects`
-- faengt das HARTE Loeschen eines Kartenobjekts. Gegen das WEICHE
-- (`deleted_at`) hilft er nicht — dagegen hilft der `sichtbar`-Riegel im
-- Client.
--
--
-- RLS — HEUTE NUR DER BESITZER, MORGEN ADDITIV MEHR
-- -------------------------------------------------
-- Eine Policy je Kommando — vier auf `standgruppen`, DREI auf
-- `standgruppen_staende` (dort gibt es kein UPDATE, s. unten). Nicht eine
-- `for all`. Dieselbe
-- Begruendung wie 079, 109, 110 und 111: eine `for all`-Policy prueft ihr
-- USING auch gegen die NEUE Zeile.
--
-- `kann_revier_pflegen()` wird ausdruecklich NICHT benutzt, obwohl es seit
-- 071/077 existiert: es gilt seit 068 auch fuer Scheininhaber, und wer einen
-- Begehungsschein hat, darf jagen — nicht das Revierinventar umschreiben.
-- Zeichengleich zur Begruendung von 079 und 109.
--
-- Die spaetere Erweiterung um Jagdleiter ist eine ZUSAETZLICHE Policy, keine
-- geaenderte — Bauform von 089 („uebertragen bedeutet ich behalte alle meine
-- rechte, jemand anderes hat sie allerdings auch"). Policies sind
-- OR-verknuepft; der Besitzer verliert dabei nichts. Das ist der Grund, warum
-- die Bedingung heute schmal sein darf, ohne sich spaeter zu raechen.
--
-- Die Bedingungen stehen als INLINE-SUBQUERY, nicht als Funktionsaufruf.
-- Folge (AGENTS.md, „Ruft eine Policy eine Funktion"): fuer `anon` liefern sie
-- still 0 Zeilen statt eines harten `42501`.
--
--
-- DER RIEGEL GEGEN EINEN STAND AUS FREMDEM REVIER
-- -----------------------------------------------
-- `standgruppen_staende.map_object_id` darf kein Objekt eines FREMDEN Reviers
-- aufnehmen. Das ist keine Kosmetik: eine Gruppe, die Staende zweier Reviere
-- mischt, erzeugt auf jeder Karte einen Marker, den es dort nicht gibt.
--
-- Der Trigger ist bewusst INVOKER, nicht SECURITY DEFINER — Muster von 097 und
-- 106. Die Pruefung laeuft dadurch durch RLS, und ein Verweis auf ein
-- unsichtbares Objekt scheitert als „gibt es nicht", ohne dessen Existenz zu
-- bestaetigen. Ein DEFINER haette daraus ein Orakel gemacht.
--
-- `search_path = public, pg_temp` steht als PROJEKTKONVENTION (AGENTS.md,
-- pg_temp ans ENDE) — NICHT weil dieser Rumpf es braeuchte. Die Fremdpruefung
-- (P3, 10.08.2026) hat den ersten Kommentar hier widerlegt: beide Zugriffe
-- sind `public.`-qualifiziert, ein `create temp table map_objects` erreicht
-- sie also gar nicht. Die Zeile bleibt, weil sie beim naechsten unqualifizierten
-- Zugriff traegt; die Begruendung war falsch, nicht die Zeile.
--
-- Er prueft `before insert or update of gruppe_id, map_object_id`. Der erste
-- Entwurf pruefte nur INSERT und begruendete das mit „ein UPDATE darauf ist
-- ein Loeschen plus Anlegen" — das ist die PK-SEMANTIK, nicht die
-- UPDATE-Mechanik (Fremdpruefung P2). Heute ist der Weg ohnehin zu, weil es
-- KEINE UPDATE-Policy auf `standgruppen_staende` gibt; der Riegel haelt damit
-- aber auch dann, wenn eine spaetere Migration eine einbaut. Dieselbe Lehre
-- wie 092: ein Riegel nur auf INSERT ist einer, der auf das Wohlverhalten
-- kuenftiger Migrationen setzt.
--
--
-- `district_id` STEHT NACH DEM INSERT FEST
-- ---------------------------------------
-- Zweiter Riegel, aus der Fremdpruefung (P1, 10.08.2026). `standgruppen`
-- braucht eine UPDATE-Policy (Umbenennen), und die deckt jede Spalte ab. Wer
-- ZWEI Reviere besitzt — Moritz besitzt heute beide —, kann `district_id`
-- einer Gruppe umbiegen, waehrend ihre Standzeilen unveraendert liegenbleiben.
-- Danach enthaelt eine L7-Gruppe Soeder-Staende: genau die Invariante, fuer
-- die der Riegel oben gebaut ist, nur ueber die Elternzeile ausgehebelt.
--
-- Festhalten statt nachvalidieren, wie 085 (`besitzer_id`, `profil_id`), 087
-- (drei Spalten) und 090 (`erlegt_am`): das Verschieben einer Gruppe zwischen
-- Revieren ist kein Anwendungsfall, den jemand vermisst — die Staende einer
-- Gruppe gehoeren per Konstruktion zu EINEM Revier.
--
--
-- ZWEI BEFUNDE BEWUSST NICHT BEHOBEN (Fremdpruefung, beide `low`)
-- --------------------------------------------------------------
-- P5: Ein NBSP (U+00A0) oder ZWSP passiert den CHECK und erzeugt einen optisch
--     leeren Namen. Zeichengleich zu 111: SQL kennt kein `\p{Cf}`, der Preis
--     einer Reparatur waere eine wachsende Zeichenliste im CHECK, und der
--     Schaden ist eine Gruppe ohne sichtbaren Namen. Der Client normalisiert
--     mit `\p{Cf}` vor dem Schreiben (dort kostet die vollstaendige Fassung
--     nichts).
-- P8: `created_at` ist vom Client faelschbar. Zeichengleich zu 109 und 111 —
--     der Zeitstempel ist eine Auskunft, kein Nachweis, und an ihm haengt
--     keine Berechtigung. Faellig, wenn er eine Auskunft an Dritte wird.
--
-- NEBENWIRKUNG, BENANNT: weil die Pruefung durch RLS laeuft und alle fuenf
-- SELECT-Policies auf `map_objects` `deleted_at is null` tragen, laesst sich
-- ein WEICH GELOESCHTER Stand nicht in eine Gruppe aufnehmen. Das ist
-- gewollt — er steht auf keiner Karte.
--
--
-- WAS BEWUSST FEHLT
-- -----------------
--   * kein `sequence` — eine Gruppe ist eine MENGE. Die Anstell-Reihenfolge
--     ist in Treiben-Konzept §9 vertagt.
--   * kein Surrogatschluessel `id` auf `standgruppen_staende` — der PK
--     `(gruppe_id, map_object_id)` IST die Regel „ein Stand hoechstens einmal
--     je Gruppe". Kein Fremdschluessel zeigt auf die Tabelle. Wie 111.
--   * kein `besitzer_id` — die Gruppe gehoert dem Revier, nicht einem
--     Menschen. Wer schreiben darf, sagt RLS.
--   * kein `updated_at` auf `standgruppen_staende` — die Zeilen werden
--     angelegt und geloescht, nie geaendert.
--   * KEIN Riegel auf den Objekttyp. `standgruppen_staende` nimmt jedes
--     `map_objects`-Objekt des Reviers auf — auch eine Kirrung, einen
--     Grenzpunkt oder ein Flaechenobjekt, nicht nur einen Stand
--     (Schlusslesung F6, 10.08.2026). Das ist Client-Sache: der Picker bietet
--     Staende an. Ein Typ-Riegel im Trigger wird faellig, sobald ein ZWEITER
--     Schreibpfad entsteht — dieselbe Grenze wie ueberall in diesem Projekt.
--   * kein case-unabhaengiges UNIQUE. „Sauberg" und „sauberg" koennen
--     nebeneinander stehen (Schlusslesung F6, Nebenbeobachtung). Ein
--     `unique (district_id, lower(name))` waere moeglich; in Kauf genommen,
--     weil der Client den Namen ohnehin normalisiert und der Schaden zwei
--     aehnlich heissende Gruppen in EINER Liste sind, die derselbe Mensch
--     angelegt hat.
--   * kein Backfill. Die vier Soeder-Geografien haengen an einer Jagd namens
--     „Test"; welche davon eine Vorlage sein soll und unter welchem Namen,
--     entscheidet Moritz beim ersten Anlegen. Raten waere eine Vorlage, die
--     niemand bestellt hat.
--
-- `update_updated_at()` wird WIEDERVERWENDET, nicht neu geschrieben: die
-- Funktion existiert, haengt bereits an 8 Tabellen, ist SECURITY INVOKER, und
-- EXECUTE ist allen drei Rollen seit 082 entzogen. Es braucht also keinen
-- neuen Funktionskoerper und keinen neuen REVOKE.


-- ---------------------------------------------------------------- Tabellen --

create table if not exists public.standgruppen (
  id          uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Zweites Argument zwingend: `btrim(text)` ohne Zeichenmenge entfernt NUR
  -- gewoehnliche Leerzeichen. Ein einzelner Zeilenumbruch rutschte sonst durch
  -- und erzeugte eine namenlose Gruppe (Befund der Fremdpruefung zu 111).
  constraint standgruppen_name_nicht_leer
    check (btrim(name, E' \t\r\n') <> ''),

  -- Zwei „Sauberg" in EINEM Revier sind ein Fehler, kein Fall. Ueber Reviere
  -- hinweg ist Namensgleichheit erlaubt und folgenlos: eine Jagd hat ein
  -- Revier.
  constraint standgruppen_name_je_revier unique (district_id, name)
);

create table if not exists public.standgruppen_staende (
  gruppe_id     uuid not null references public.standgruppen(id) on delete cascade,
  map_object_id uuid not null references public.map_objects(id) on delete cascade,
  created_at    timestamptz not null default now(),

  primary key (gruppe_id, map_object_id)
);

-- KEIN Index auf `map_object_id` (Ponytail-Lesung 10.08.2026). Der erste
-- Entwurf hatte einen, begruendet mit „in welchen Gruppen steckt dieser
-- Stand?" — eine Abfrage, die es nicht gibt: der Editor ist nicht gebaut.
-- Dieselbe Entscheidung wie in 111. Faellig mit dem Screen, der sie stellt,
-- oder wenn die Tabelle waechst.


-- ---------------------------------------------------------------- Kommentare --

comment on table public.standgruppen is
  'Benannte, wiederverwendbare Standmenge an einem Revier („Sehl-Trift", '
  '„Sauberg"). Vorlage fuer Treiben; die Anwendung kopiert, sie verweist '
  'nicht.';

comment on column public.standgruppen.district_id is
  'Das Revier, dessen Inventar die Gruppe ist. CASCADE: eine Gruppe ohne ihr '
  'Revier ist sinnlos.';

comment on table public.standgruppen_staende is
  'Mitgliedschaft Stand -> Gruppe. Menge, keine Reihenfolge.';

comment on column public.standgruppen_staende.map_object_id is
  'Muss zum selben Revier gehoeren wie die Gruppe — erzwungen vom '
  'Invoker-Trigger `trg_standgruppen_staende_revier`.';


-- ---------------------------------------------------------------- updated_at --

drop trigger if exists trg_standgruppen_updated on public.standgruppen;

create trigger trg_standgruppen_updated
  before insert or update on public.standgruppen
  for each row execute function public.update_updated_at();


-- ------------------------------------------- Riegel: Revier steht nach INSERT --

create or replace function public.standgruppe_revier_ist_fest()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.district_id is distinct from old.district_id then
    raise exception
      'Das Revier einer Standgruppe steht nach dem Anlegen fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.standgruppe_revier_ist_fest()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_standgruppen_revier_fest on public.standgruppen;

create trigger trg_standgruppen_revier_fest
  before update of district_id on public.standgruppen
  for each row execute function public.standgruppe_revier_ist_fest();


-- --------------------------------------------------- Riegel: fremdes Revier --

create or replace function public.standgruppe_stand_muss_zum_revier_passen()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  gruppen_revier uuid;
  stand_revier   uuid;
begin
  select district_id into gruppen_revier
    from public.standgruppen where id = new.gruppe_id;

  -- Laeuft durch RLS: ein Objekt eines fremden Reviers ist hier schlicht nicht
  -- da, und die Meldung bestaetigt seine Existenz nicht.
  select district_id into stand_revier
    from public.map_objects where id = new.map_object_id;

  -- `is distinct from` faengt auch den Fall, dass die Gruppe unsichtbar ist
  -- (`gruppen_revier` null) — die erste Bedingung faengt beide-null.
  if stand_revier is null or stand_revier is distinct from gruppen_revier then
    raise exception
      'Stand gehoert nicht zu diesem Revier'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.standgruppe_stand_muss_zum_revier_passen()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_standgruppen_staende_revier on public.standgruppen_staende;

create trigger trg_standgruppen_staende_revier
  before insert or update of gruppe_id, map_object_id on public.standgruppen_staende
  for each row execute function public.standgruppe_stand_muss_zum_revier_passen();


-- ---------------------------------------------------------------------- RLS --

alter table public.standgruppen        enable row level security;
alter table public.standgruppen_staende enable row level security;

-- Wiederholungslauf-fest, uebernommen aus 109/110/111 (Fremdpruefung P10):
-- ohne die Drops scheitert ein zweiter Lauf am ersten bestehenden Objekt mit
-- `duplicate_object`.
drop policy if exists standgruppen_select on public.standgruppen;
drop policy if exists standgruppen_insert on public.standgruppen;
drop policy if exists standgruppen_update on public.standgruppen;
drop policy if exists standgruppen_delete on public.standgruppen;
drop policy if exists standgruppen_staende_select on public.standgruppen_staende;
drop policy if exists standgruppen_staende_insert on public.standgruppen_staende;
drop policy if exists standgruppen_staende_delete on public.standgruppen_staende;

create policy standgruppen_select on public.standgruppen
  for select to authenticated
  using (exists (select 1 from public.districts d
                  where d.id = standgruppen.district_id
                    and d.owner_id = auth.uid()));

create policy standgruppen_insert on public.standgruppen
  for insert to authenticated
  with check (exists (select 1 from public.districts d
                       where d.id = standgruppen.district_id
                         and d.owner_id = auth.uid()));

create policy standgruppen_update on public.standgruppen
  for update to authenticated
  using (exists (select 1 from public.districts d
                  where d.id = standgruppen.district_id
                    and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.districts d
                       where d.id = standgruppen.district_id
                         and d.owner_id = auth.uid()));

create policy standgruppen_delete on public.standgruppen
  for delete to authenticated
  using (exists (select 1 from public.districts d
                  where d.id = standgruppen.district_id
                    and d.owner_id = auth.uid()));

create policy standgruppen_staende_select on public.standgruppen_staende
  for select to authenticated
  using (exists (select 1 from public.standgruppen g
                   join public.districts d on d.id = g.district_id
                  where g.id = standgruppen_staende.gruppe_id
                    and d.owner_id = auth.uid()));

create policy standgruppen_staende_insert on public.standgruppen_staende
  for insert to authenticated
  with check (exists (select 1 from public.standgruppen g
                        join public.districts d on d.id = g.district_id
                       where g.id = standgruppen_staende.gruppe_id
                         and d.owner_id = auth.uid()));

-- KEINE UPDATE-Policy auf `standgruppen_staende`, und das ist kein Versehen
-- (Ponytail-Lesung 10.08.2026). Alle Spalten ausser `created_at` bilden den
-- Primaerschluessel; der Client legt an und loescht. Eine Policy fuer ein
-- Kommando, das niemand ausfuehrt, waere tot.
--
-- SIE IST HEUTE DEFENSE-IN-DEPTH, NICHT DER RIEGEL. Als dieser Kommentar
-- entstand, war sie beides: der Revier-Trigger feuerte damals nur
-- `before insert`, ein UPDATE auf `gruppe_id` haette also umhaengen koennen,
-- ohne ihn auszuloesen. Seit der Trigger `insert or update of gruppe_id,
-- map_object_id` prueft (Fremdpruefung P2), haelt er diesen Weg selbst —
-- auch fuer Rollen, die RLS umgehen. Die fehlende Policy ist die zweite
-- Schranke, nicht die erste.
-- (Die alte Fassung dieses Absatzes behauptete noch das Loch, das der
-- Trigger inzwischen schliesst — gefunden von der Schlusslesung, A1.)

create policy standgruppen_staende_delete on public.standgruppen_staende
  for delete to authenticated
  using (exists (select 1 from public.standgruppen g
                   join public.districts d on d.id = g.district_id
                  where g.id = standgruppen_staende.gruppe_id
                    and d.owner_id = auth.uid()));
