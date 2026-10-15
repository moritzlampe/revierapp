-- 141: Was Schuetzen von der Jagd sehen (CN-278) und Grundkarte am Konto
-- (CN-358).
--
-- ANLASS: Feedback #13 (01.10.2026) und #28 (11.10.2026) — der Jagdleiter
-- stellt ein, wie viel ein Schuetze von der Jagd sieht: nur den eigenen
-- Stand, Nachbarn im Umkreis von X m, oder alles. Moritz, 14.10.2026:
-- Geheimhaltung, nicht Aufraeumen — der Server gibt die Daten nicht heraus,
-- in App und PWA, auch offline und nach Jagdende (V1).
-- Bauplan (F14 geprueft, GELOCKT 15.10.2026, Entscheidungen V1–V13):
--   quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Gast_Sicht_V1.md
-- Begruendung und Pruefkette: quickhunt-native/docs/migrationen/141_schuetzen_sicht.md
--
--
-- DIE REGEL IN SECHS SAETZEN
--
-- 1. Drei Spalten auf `hunts` sagen, was Schuetzen und Gruppenleiter sehen:
--    `schuetzen_sicht` alles/umkreis/eigener, `sicht_umkreis_m`,
--    `gruppenleiter_sicht` alles/wie_schuetzen. Default `alles`. Dieselben
--    drei auf `user_settings` sind die Grundeinstellung; ein
--    BEFORE-INSERT-Trigger kopiert sie in jede neue Jagd, aus jedem Client
--    (E1, V11).
-- 2. Wer beschraenkt wird, sagt `sicht_stufe()` in fester Rangfolge (E2):
--    Ersteller, Revierbesitzer, Jagdleiter → `leitung`; Treiber, auch mit
--    Tag → `treiber`; Schuetze mit Tag `gruppenleiter` bei
--    `gruppenleiter_sicht = 'alles'` → `alles`; jeder andere → die Stufe der
--    Jagd. Wer an der Jagd nicht teilnimmt → `keine`.
-- 3. Der "eigene Stand" kommt NUR aus Zeilen, die Ersteller oder Leiter
--    DIESER Jagd schreiben (Sitzordnung, Treiben-Staende), und nur mit einem
--    Objekt im Revier DIESER Jagd, das die Jagd auch deckt (E3). Der
--    Stand-Bezug zaehlt nicht; `hunt_participants.stand_id` ist stillgelegt.
-- 4. Reviereinrichtungen und Zonen kommen ueber eine Teilnahme nur, solange
--    die Jagd offen ist: `active`/`paused`, oder `scheduled` an ihrem
--    Jagdtag ab 0 Uhr Berlin (E6, V7, V12). Die Leitung ist ausgenommen.
-- 5. Die bestehenden Teilnehmer-Policies bekommen eine Sichtbedingung. Nach
--    aussen gibt es nur Ja/Nein-Funktionen, keine Koordinaten (E5). Wege
--    und Live-Punkte werden je TEILNEHMER geprueft, nicht je Positionszeile
--    (96.728 Zeilen).
-- 6. Das Umsetzen eines Stands wird atomar: zwei Invoker-Funktionen, beide
--    Schritte in einer Transaktion (E3, Codex Delta 2).
--
--
-- ABWEICHUNGEN VOM BAUPLAN, BENANNT
--
-- a) `zeile_in_sicht` ist in ZWEI interne Funktionen geteilt:
--    `stand_zeile_in_sicht` (Sitzordnung, Stand-Bezug, Treiben-Staende) und
--    `meldung_in_sicht` (Anblicke, Erlegungen). Grund: die Treiber-Regel
--    unterscheidet beide (E4). Ein Treiber sieht die Meldungen anderer
--    Treiber, aber keinen Stand.
--    Nach aussen nehmen fuenf Ja/Nein-Funktionen NUR die ID der Zeile
--    (`sitz_`, `bezug_`, `treiben_stand_`, `anblick_`, `erlegung_in_sicht`)
--    und lesen Ort, Objekt und Person selbst aus der gespeicherten Zeile.
--    Die erste Fassung nahm Objekt und Ort als Parameter. Damit liess sich
--    per RPC abfragen, ob ein VERBORGENES Objekt im Umkreis des eigenen
--    Stands liegt (Codex 141 A4 [hoch]). Die Lehre aus 130 Falle 3,
--    eine Tabelle weiter.
-- b) `zonen_in_sicht` ist eine dritte Ja/Nein-Funktion. Grund: eine Policy
--    laeuft mit den Rechten des Aufrufers und darf `sicht_stufe` nicht
--    rufen (EXECUTE entzogen → 42501). Sie verraet nichts, was ein `select`
--    auf `zones` nicht auch zeigte.
-- c) `sicht_stufe` liefert fuer E2 Zeile 1 `leitung` statt `alles`. Grund:
--    nur die Leitung ist von V7/V12 ausgenommen, und die Funktionen muessen
--    beide Faelle unterscheiden.
-- d) Das Fenster aus V12 laeuft von 0 Uhr Berlin am Tag von
--    `scheduled_for` bis `scheduled_until` (ohne Ende: bis Mitternacht des
--    Jagdtags; Trigger 107 setzt es ohnehin). Eine Fassung, die bis
--    Mitternacht des Endtags rechnete, ist verworfen (Codex 141 A6): sie
--    verschob die Grenze aus E6/E7.
--    Liegt `scheduled_until` vor `scheduled_for` (kein DB-Riegel, 095),
--    bleibt das Fenster zu, auch am selben Tag (Codex 141 B9).
-- e) In `objekt_in_sicht` und `zonen_in_sicht` gilt die LEITUNG (E2 Zeile
--    1) ueber jede Teilnahme, auch `left` — in jedem Status, wie im
--    Bauplan. Moritz, 15.10.2026: *"eigentlich ist der jagdleiter doch
--    immer die leitung. verlaesst er versehentlich die jagd und will wieder
--    rein ist das problematisch da er im zweifel die verantwortung der jagd
--    hat"* (Codex 141 A3; die Fassung v2/v3 hatte die Leitung an `joined`
--    gebunden und ist damit ueberholt).
--    `alles`, `umkreis` und die "immer sichtbaren" Typen
--    (`notfall_treffpunkt`, `parkplatz`) gelten nur fuer `joined`, wie
--    bisher die ganze Policy. Ein `left`-GAST bekommt nur seinen eigenen
--    Stand (E5 (c), Codex P6) — das ist gegenueber heute eine Erweiterung.
--    Sitzordnung, Stand-Bezug, Live und Wege behalten ihre heutigen
--    Teilnahme-Riegel (`joined`); auch fuer die Leitung aendert sich dort
--    nichts.
-- f) Der Trigger ueberschreibt, wenn der Ersteller eine
--    `user_settings`-Zeile hat (heute 4 Konten). Ohne Zeile bleibt, was der
--    INSERT traegt — heute schickt kein Client die Spalten, also der Default.
-- g) `jagd_deckt_objekt` steht in keiner Policy mehr. Die Funktion bleibt
--    (der generierte Typ kennt sie), EXECUTE wird aber allen entzogen. Kein
--    Client ruft sie (gemessen: nativ, PWA, Portal). Sonst bliebe eine
--    Auskunft "liegt Objekt X in einem Revier, in dem ich je Gast war" ohne
--    das Fenster aus V7.
-- h) Zwei neue Lese-Policies fuer den ERSTELLER
--    (`seat_assignments_creator_select`, `drive_stands_creator_select`).
--    Er schreibt diese Zeilen schon heute; lesen konnte er sie nur ueber
--    die Teilnahme. Ohne eigene Policy scheiterte sein `.insert().select()`
--    an der ID-Funktion (Schnappschuss, §4; Codex 141 Delta 6). Er ist
--    Leitung (E2 Zeile 1) — er sieht dadurch nichts, was ihm nicht
--    zusteht.
--    ⚠ Die Policies haengen allein an `hunts.creator_id`, AUCH OHNE
--    Teilnahme. Damit ueberholt h) den Bauplan-Satz in E2 ("Ersteller ohne
--    Teilnehmerzeile … daran aendert dieser Plan nichts") fuer Sitzordnung
--    und Treiben-Staende. Ebenso den Kommentar in `seats.ts`
--    (insertAdhocStandWithId: "creator who is not joined may INSERT but not
--    read … 42501"). Der INSERT gelingt jetzt. Bestand: 0 Ersteller ohne
--    joined-Jagdleiter-Zeile (Schlusslesung 141 Delta, F1).
--
--
-- SICHERHEIT
--
-- - Alle neuen Lesefunktionen sind SECURITY DEFINER, STABLE und haben
--   `search_path = public, extensions, pg_temp` (076; `extensions` fuer
--   PostGIS, 137).
--   Der Selbst-Lookup auf `map_objects` in der `map_objects`-Policy ist nur
--   deshalb rekursionsfrei (130 Falle 4). NIE auf INVOKER umstellen.
-- - EXECUTE wird namentlich entzogen, nicht bloss von PUBLIC (081/082). Nur
--   die sieben Ja/Nein-Funktionen in §4 erhalten EXECUTE fuer `authenticated`.
-- - Jede Policy, die eine dieser Funktionen ruft, steht auf
--   `to authenticated`. Sonst bekaeme `anon` statt 0 Zeilen ein `42501`
--   (Schlusslesung P5). Fuenf Policies wechseln deshalb von `public`.
-- - Fuer eine Jagd, an der der Aufrufer nicht teilnimmt, liefern alle
--   Ja/Nein-Funktionen `false` (E2 Zeile 0).
-- - Was sie per RPC verraten: ob ein Objekt, eine Zone oder eine Zeile
--   sichtbar waere — hoechstens, was ein `select` zeigt: Jede nimmt NUR
--   eine ID (nie einen Ort oder ein frei gewaehltes Objekt, 130 Falle 3,
--   Abweichung a) und traegt die vollen Bedingungen ihrer Policy (Codex 141
--   Delta 2).
-- - `schein_deckt_objekt/4` (EXECUTE fuer niemanden, 130 Falle 2) wird nur
--   aus DEFINER-Funktionen gerufen.
-- - Gemessen 15.10.2026 (PostGIS 3.3.7): ein Punkt ausserhalb von
--   [-180,180]×[-90,90], `NaN` oder `Infinity` laesst den Cast nach
--   `geography` NICHT scheitern; `st_dwithin` liefert `false`. Eine
--   kaputte Koordinate in einer Sitzzeile oder Erlegung bricht also nicht
--   die Abfrage aller anderen ab.
--
--
-- WAS SICH BEIM APPLIZIEREN AENDERT (E6, "vor dem Applizieren neu zaehlen")
--
-- Die SPALTEN aendern an keiner Jagd etwas (Default `alles`). V7 dagegen
-- schon, auch bei `alles`: Gaeste beendeter Jagden verlieren dort die
-- Reviereinrichtungen und Zonen, nicht aber Grenze, eigene Staende, Wege
-- (Frist 133), Anblicke und Erlegungen. Stand 15.10.2026: 13 Jagden,
-- 1 `active`. Gaeste der laufenden Jagd behalten ihre Sicht.
--
--
-- NICHT IN DIESER MIGRATION (Bauplan §5, CN-359 bis CN-365):
-- - Gruppen;
-- - Stufe in "Neue Jagd";
-- - Streckensumme;
-- - PWA-Nachladen;
-- - GPS-EXIF;
-- - `hunt_photos` mit `kill_ids`.
-- Die PWA setzt Staende weiter in zwei Anfragen um (E9, Maintenance) — dort
-- bleibt der kurze "ohne Stand"-Zustand.
--
-- BENANNTE RESTE:
-- - Ein `left`-Gast, dessen Stand NUR ein Ad-hoc-Sitz ohne `user_id` ueber
--   ein Treiben ist, sieht diese Sitzzeile nicht. Fremde Sitzzeilen gibt es
--   fuer `left` nur ueber `joined`; das bleibt so (Codex 141 Delta 1).
--   Heute sieht ein `left`-Gast gar keine Sitzzeile — keine Regression.
--   Bestand: 0 Treiben.
-- - Verlaesst ein FREMDER Stand-Bezug per UPDATE den Umkreis, liefert
--   Realtime kein Ereignis (RLS unterdrueckt es); der alte Bezug steht bis
--   zum Neuladen (Codex 141 B5). Eine veraltete Anzeige, kein Leck — der
--   Client laedt beim Vordergrund-Wechsel und beim Sicht-Schluessel neu
--   (E7).
-- - `kills.hochsitz_id` traegt in jeder sichtbaren Erlegung die ID des
--   Stands, ohne Koordinate; kein Client liest sie (Schlusslesung 141, S9).
-- - Ein reiner Treiber mit nur ZUGETEILTEM Stand (nicht eingeloggt) bleibt
--   fuer alle sichtbar (V15: erst das Einloggen macht ihn zum Schuetzen).
-- - "Am Stand" wird beim LESEN geprueft, nicht beim Melden. Endet der
--   Bezug eines reinen Treibers, werden seine frueheren Meldungen und Wege
--   fuer andere Treiber wieder sichtbar — samt dem Ort des Stands, an dem
--   er stand (Codex 141 Delta 4). Der Bezug endet beim Ausloggen, bei JEDEM
--   Treiben-Ende (`trg_clear_stand_bezug_on_drive_end` raeumt alle Bezuege
--   der Jagd) und bei Jagdende (`trg_hunts_stand_bezug_clear`)
--   (Schlusslesung 141 Delta 2, F1). Ein Hundefuehrer mit fortbestehender
--   Zuteilung bleibt eingeschraenkt.
-- - Loggt sich ein Treiber ein, faellt sein Live-Punkt fuer Schuetzen aus
--   der Policy, ohne DELETE-Ereignis; der letzte Punkt steht bis zum
--   Neuladen (E7; dieselbe Klasse wie Codex B5).
-- - Ein Jagdleiter, der die Jagd verlassen hat, sieht nach V14 Objekte und
--   Zonen, aber nicht die Reviergrenze: `districts_joined_participant_select`
--   kennt nur `joined` (vorbestehend, Bauplan E6; CN-366).
--
--
-- ⚠ DIESE DATEI TRAEGT BEWUSST KEIN `\set ON_ERROR_STOP on` (120-Muster).
-- Ueber psql (Kartei psql, 132):
--   psql -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'" \
--        -c "set statement_timeout = '120s'" -f 141_schuetzen_sicht.sql
-- Registrierung dann von Hand nachtragen.
-- ⚠ GEZIELT APPLIZIEREN, nie ueber "alle ausstehenden" (115, T9).
-- ⚠ Am besten, wenn keine Jagd laeuft: `alter table hunts` haelt die Sperre
-- bis zum COMMIT. Eine gleichzeitige Erlegung (`trg_kills_activity` →
-- `update hunts`) und das spaetere `alter policy` auf `kills` koennen sich
-- kreuzen → `40P01`. Eine Seite bricht ab, die Migration bleibt atomar
-- (Schlusslesung 141, F5).
-- ⛔ VOR dem nativen Build applizieren, der die neuen Spalten liest
-- (`fetchHuntSummary`, Jagdeinstellungen). Builds bis 49 lesen sie nicht
-- und bleiben unveraendert.

begin;

-- ---------------------------------------------------------------------------
-- 1. Spalten
-- ---------------------------------------------------------------------------

alter table public.hunts
  add column schuetzen_sicht text not null default 'alles',
  add column sicht_umkreis_m integer not null default 300,
  add column gruppenleiter_sicht text not null default 'alles',
  add constraint hunts_schuetzen_sicht_check
    check (schuetzen_sicht in ('alles', 'umkreis', 'eigener')),
  add constraint hunts_sicht_umkreis_m_check
    check (sicht_umkreis_m between 50 and 2000),
  add constraint hunts_gruppenleiter_sicht_check
    check (gruppenleiter_sicht in ('alles', 'wie_schuetzen'));

-- Dieselben Defaults wie auf `hunts`, kein NULL-Zustand (Codex Delta P10).
-- `grundkarte` dagegen MIT NULL: "am Konto noch nie gewaehlt" — ein Default
-- `topo` drehte jedem, der am Geraet `luftbild` gewaehlt hat, die Wahl
-- zurueck (Bauplan E10, CN-358).
alter table public.user_settings
  add column sicht_vorgabe_schuetzen text not null default 'alles',
  add column sicht_vorgabe_umkreis_m integer not null default 300,
  add column sicht_vorgabe_gruppenleiter text not null default 'alles',
  add column grundkarte text,
  add constraint user_settings_sicht_vorgabe_schuetzen_check
    check (sicht_vorgabe_schuetzen in ('alles', 'umkreis', 'eigener')),
  add constraint user_settings_sicht_vorgabe_umkreis_m_check
    check (sicht_vorgabe_umkreis_m between 50 and 2000),
  add constraint user_settings_sicht_vorgabe_gruppenleiter_check
    check (sicht_vorgabe_gruppenleiter in ('alles', 'wie_schuetzen')),
  add constraint user_settings_grundkarte_check
    check (grundkarte in ('topo', 'luftbild'));

-- Altlast aus 003: 0 Zeilen gesetzt, kein Schreiber in beiden Clients.
-- Sonst bliebe eine Verbindung Teilnehmer → Stand lesbar, an E3 vorbei
-- (Codex P4). Nicht geloescht: die PWA liest `select('*')`.
alter table public.hunt_participants
  add constraint hunt_participants_stand_id_stillgelegt
    check (stand_id is null);

-- ---------------------------------------------------------------------------
-- 2. Grundeinstellung beim Anlegen (E1, V11)
-- ---------------------------------------------------------------------------
-- INVOKER: `hunts_creator_all` erzwingt beim INSERT `creator_id =
-- auth.uid()`, die Zeile ist also unter `user_settings_owner_all` lesbar.
-- Kein Rumpf, der eine Tabelle anfasst, laeuft hier im Positionsstrom: der
-- Trigger feuert NUR beim INSERT (die 107-Auflage gilt fuer UPDATE-Trigger).
-- Reihenfolge: nach `trg_hunts_revier_erlaubt`; keiner der frueheren liest
-- die drei Spalten.

create function public.hunts_sicht_vorgabe()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stufe  text;
  v_radius integer;
  v_gl     text;
begin
  select us.sicht_vorgabe_schuetzen,
         us.sicht_vorgabe_umkreis_m,
         us.sicht_vorgabe_gruppenleiter
    into v_stufe, v_radius, v_gl
    from public.user_settings us
   where us.user_id = new.creator_id;
  if found then
    new.schuetzen_sicht     := v_stufe;
    new.sicht_umkreis_m     := v_radius;
    new.gruppenleiter_sicht := v_gl;
  end if;
  return new;
end;
$$;

revoke all on function public.hunts_sicht_vorgabe()
  from public, anon, authenticated, service_role;

create trigger trg_hunts_sicht_vorgabe
  before insert on public.hunts
  for each row execute function public.hunts_sicht_vorgabe();

-- ---------------------------------------------------------------------------
-- 3. Interne Helfer — EXECUTE fuer niemanden
-- ---------------------------------------------------------------------------

-- Fenster aus E6/V12 (Abweichung d). Tabellenfrei. Mitternacht wird ueber
-- `at time zone 'Europe/Berlin'` gerechnet, nie als Intervall ab
-- `scheduled_for`: der Herbst-Umstellungstag hat 25 Stunden (108).
create function public.jagd_ist_offen(p_status hunt_status,
                                      p_von timestamptz,
                                      p_bis timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
           p_status in ('active', 'paused')
           or (p_status = 'scheduled'
               and p_von is not null
               and coalesce(p_bis, p_von) >= p_von
               and now() >= (date_trunc('day', p_von at time zone 'Europe/Berlin')
                             at time zone 'Europe/Berlin')
               and now() <= coalesce(
                             p_bis,
                             (date_trunc('day', p_von at time zone 'Europe/Berlin')
                              + interval '1 day') at time zone 'Europe/Berlin')),
           false);
$$;

-- Die eigene Teilnahme an einer Jagd: joined, oder left mit `joined_at`
-- (128 Falle 1), nie entfernt — dieselbe Menge wie
-- `get_my_teilnahme_hunt_ids()`. UNIQUE (hunt_id, user_id) → hoechstens eine.
create function public.meine_teilnahme(p_hunt_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select p.id
    from public.hunt_participants p
   where p.hunt_id = p_hunt_id
     and p.user_id = auth.uid()
     and p.entfernt_am is null
     and (p.status = 'joined'
          or (p.status = 'left' and p.joined_at is not null));
$$;

-- E2. Die erste zutreffende Zeile gilt; wer in keine passt, bekommt die
-- Stufe der Jagd (ELSE, Schlusslesung P2) — nie `alles` aus Versehen.
create function public.sicht_stufe(p_hunt_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
           when h.id is null then 'keine'
           -- Zeile 1: Ersteller, Revierbesitzer, Jagdleiter (joined ODER
           -- left mit joined_at). Der Besitzer vor dem Treiber: was ihm
           -- gehoert, sieht er ueber die Besitzer-Policies ohnehin (E2).
           when h.creator_id = auth.uid()
             or d.owner_id = auth.uid()
             or t.role = 'jagdleiter' then 'leitung'
           -- Zeile 0
           when t.id is null then 'keine'
           -- Zeile 2: Treiber, auch Obertreiber (V10) und Hundefuehrer
           -- mit Rolle Treiber (E4).
           when t.role = 'treiber' then 'treiber'
           -- Zeile 3
           when t.role = 'schuetze'
            and 'gruppenleiter' = any (t.tags)
            and h.gruppenleiter_sicht = 'alles' then 'alles'
           -- Zeile 4, ELSE
           else h.schuetzen_sicht
         end
    from (select 1) eins
    left join public.hunts h on h.id = p_hunt_id
    left join public.districts d on d.id = h.district_id
    left join public.hunt_participants t
           on t.id = public.meine_teilnahme(p_hunt_id);
$$;

-- E3. Die Staende EINER Teilnahme: aus der Sitzordnung (Konto) und aus den
-- Treiben-Staenden (Teilnehmerzeile), jeweils nur in DIESER Jagd. Ein
-- Objekt zaehlt nur im Revier DIESER Jagd, nicht im Papierkorb, und nur,
-- wenn die Jagd es deckt (Logik von `jagd_deckt_objekt`, 130). `=` statt
-- `is not distinct from`: eine revierlose Jagd hat keine Objekt-Staende
-- (Codex P5). Ad-hoc-Sitze (Ort ohne Objekt) schreibt nur die Leitung der
-- Zieljagd. `sitz_id` traegt die Sitzzeile, ueber die der Stand kommt:
-- `eigener` entscheidet ueber IDs (E3), und ein Ad-hoc-Sitz ohne
-- `user_id`, der nur ueber ein Treiben zugeteilt ist, ist sonst nicht als
-- eigener erkennbar (Codex 141 A2/B1).
create function public.staende_der_teilnahme(p_teilnahme uuid)
returns table (objekt_id uuid, sitz_id uuid, ort geometry)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with t as (
    select p.id, p.hunt_id, p.user_id,
           h.district_id, h.creator_id, d.owner_id
      from public.hunt_participants p
      join public.hunts h on h.id = p.hunt_id
      left join public.districts d on d.id = h.district_id
     where p.id = p_teilnahme
       and p.entfernt_am is null
  ),
  treiben_staende as (
    select ds.map_object_id, ds.seat_assignment_id
      from t
      join public.hunt_drives dr on dr.hunt_id = t.hunt_id
      join public.hunt_drive_stands ds
        on ds.drive_id = dr.id and ds.participant_id = t.id
  ),
  sitze as (
    select s.id, s.seat_id, s.position_lat, s.position_lng
      from t
      join public.hunt_seat_assignments s
        on s.hunt_id = t.hunt_id and s.user_id = t.user_id
    union
    select s.id, s.seat_id, s.position_lat, s.position_lng
      from t
      join treiben_staende ts on true
      join public.hunt_seat_assignments s
        on s.id = ts.seat_assignment_id and s.hunt_id = t.hunt_id
  ),
  objekte as (
    select s.seat_id as objekt_id, s.id as sitz_id
      from sitze s
     where s.seat_id is not null
    union
    select ts.map_object_id, null::uuid
      from treiben_staende ts
     where ts.map_object_id is not null
  )
  select o.id, ob.sitz_id, o.position
    from objekte ob
    join public.map_objects o on o.id = ob.objekt_id
    join t on o.district_id = t.district_id
   where o.deleted_at is null
     and (t.creator_id = t.owner_id
          or public.schein_deckt_objekt(t.creator_id, o.district_id,
                                        o.id, o.position))
  union all
  select null::uuid, s.id,
         st_setsrid(st_makepoint(s.position_lng, s.position_lat), 4326)
    from sitze s
   where s.seat_id is null
     and s.position_lat is not null
     and s.position_lng is not null;
$$;

-- Liegt ein Ort im Umkreis eines EIGENEN Stands dieser Jagd? `null` → nein.
create function public.ort_in_umkreis(p_hunt_id uuid, p_ort geometry)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select exists (
             select 1
               from public.staende_der_teilnahme(public.meine_teilnahme(h.id)) e
              where st_dwithin(e.ort::geography, p_ort::geography,
                               h.sicht_umkreis_m))
      from public.hunts h
     where h.id = p_hunt_id
       and p_ort is not null), false);
$$;

-- Wer als Treiber oder Hundefuehrer "am Stand steht" und darum wie ein
-- Schuetze gilt:
-- - jeder, der auf einem Stand EINGELOGGT ist (Stand-Bezug). Moritz,
--   15.10.2026, zum reinen Treiber: *"wie ein treiber immer, wie ein
--   schuetze sobald er auf einem stand eingeloggt ist"* (V15);
-- - ein Hundefuehrer (Tag, gleich welche Rolle) auch mit ZUGETEILTEM
--   Stand (V13).
-- Der Stand-Bezug ist selbst geschrieben. Hier zaehlt er nur als Ja/Nein
-- ("eingeloggt"), nie mit seinem Ort: das schraenkt nur die Sicht AUF den
-- Schreiber ein. Mit Ort waere er ein Seitenkanal gewesen — ein Treiber
-- loggt sich auf eine verborgene Objekt-ID ein, und ein Schuetze erfuehre
-- an dessen Sichtbarkeit, ob das Objekt in seinem Umkreis liegt (Codex 141
-- Delta 3 [hoch]; die Fassung v4 trug dafuer eine eigene Ortsfunktion).
-- Wer eingeloggt ist, gilt also wie ein Schuetze: im Umkreis sichtbar nur
-- ueber einen ZUGETEILTEN Stand (E3).
create function public.steht_am_stand(p_teilnahme uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select exists (select 1 from public.hunt_stand_bezug b
                    where b.participant_id = t.id and b.hunt_id = t.hunt_id)
        or (coalesce('hundefuehrer' = any (t.tags), false)
            and exists (select 1 from public.staende_der_teilnahme(t.id)))
      from public.hunt_participants t
     where t.id = p_teilnahme), false);
$$;

-- Live-Punkt und Weg EINER Teilnahme (E3-Tabelle, V8, V13).
-- - Leitung und `alles`: alle.
-- - Treiber sehen Treiber (V4).
-- - Bei `eigener` und `umkreis`: immer Treiber und Hundefuehrer, die
--   KEINEN Stand haben; bei `umkreis` dazu, wessen Stand im Umkreis liegt.
-- Wer am Stand steht (`steht_am_stand`: eingeloggt, oder Hundefuehrer mit
-- zugeteiltem Stand), gilt wie ein Schuetze, auch mit Rolle `treiber` —
-- sonst verriete sein Live-Punkt den Stand (V13, V15, Codex 141 A5). Ein
-- Treiber, der nicht am Stand steht, bleibt immer sichtbar (V8), auch
-- fuer andere Treiber. Beim Umkreis zaehlt nur der ZUGETEILTE Stand, wie
-- fuer jeden Schuetzen (E3).
create function public.teilnahme_in_sicht(p_teilnahme uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select case
             when st.stufe in ('leitung', 'alles') then true
             when st.stufe = 'treiber' then
                  t.role = 'treiber' and not ms.am_stand
             else st.stufe in ('eigener', 'umkreis')
                  and ((not ms.am_stand
                        and (t.role = 'treiber'
                             or coalesce('hundefuehrer' = any (t.tags), false)))
                       or (st.stufe = 'umkreis'
                           and exists (
                                 select 1
                                   from public.staende_der_teilnahme(t.id) s
                                  where public.ort_in_umkreis(t.hunt_id, s.ort))))
           end
      from public.hunt_participants t
      cross join lateral (select public.sicht_stufe(t.hunt_id) as stufe) st
      cross join lateral (select public.steht_am_stand(t.id) as am_stand) ms
     where t.id = p_teilnahme), false);
$$;

revoke all on function public.jagd_ist_offen(hunt_status, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.meine_teilnahme(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.sicht_stufe(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.staende_der_teilnahme(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ort_in_umkreis(uuid, geometry)
  from public, anon, authenticated, service_role;
revoke all on function public.teilnahme_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.steht_am_stand(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Ja/Nein nach aussen — EXECUTE nur fuer `authenticated`
-- ---------------------------------------------------------------------------

-- Ersetzt `jagd_deckt_objekt` in `map_objects_hunt_member`. Ein Objekt ist
-- sichtbar, wenn IRGENDEINE Teilnahme des Betrachters es zeigt (E5; zwei
-- gleichzeitig offene Jagden im selben Revier: die weitere gewinnt,
-- hingenommen). Je Jagd muss sie das Objekt decken, und dann gilt eines:
--   (b) Leitung — jeder Status, auch `left` (E2 Zeile 1, von V7
--       ausgenommen; Abweichung e);
--   (c) es ist ein eigener Stand dieser Jagd — jeder Status, auch `left`;
--   nur `joined`:
--   (d) "immer sichtbarer" Typ — jeder Status;
--   (a) `alles`, bzw. `umkreis` um einen eigenen Stand — nur offen (E6).
create function public.objekt_in_sicht(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from public.map_objects o
      join public.hunts h on h.district_id = o.district_id
      join public.districts d on d.id = h.district_id
      join public.hunt_participants m
        on m.hunt_id = h.id
       and m.user_id = auth.uid()
       and m.entfernt_am is null
       and (m.status = 'joined'
            or (m.status = 'left' and m.joined_at is not null))
     where o.id = p_object_id
       -- Auch hier, obwohl die Policy es prueft: sonst verriete die RPC
       -- eine Papierkorb-ID (Schlusslesung Delta D3, 130 F5).
       and o.deleted_at is null
       and (h.creator_id = d.owner_id
            or public.schein_deckt_objekt(h.creator_id, o.district_id,
                                          o.id, o.position))
       and (
             public.sicht_stufe(h.id) = 'leitung'
          or (m.status = 'joined'
              and (o.type in ('notfall_treffpunkt', 'parkplatz')
                   or case public.sicht_stufe(h.id)
                        when 'alles' then
                             public.jagd_ist_offen(h.status, h.scheduled_for,
                                                   h.scheduled_until)
                        when 'umkreis' then
                             public.jagd_ist_offen(h.status, h.scheduled_for,
                                                   h.scheduled_until)
                             and public.ort_in_umkreis(h.id, o.position)
                        else false
                      end))
          or exists (select 1
                       from public.staende_der_teilnahme(m.id) e
                      where e.objekt_id = o.id)
           )
  );
$$;

-- Zonen (E5): nur, wenn eine OFFENE Jagd mit Stufe `alles` sie zeigt
-- (`joined`), oder der Betrachter dort Leitung ist (jeder Status, auch
-- `left`, Abweichung e). Der 121-Riegel bleibt: nur Jagden des
-- Revierbesitzers.
create function public.zonen_in_sicht(p_district_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from public.hunts h
      join public.districts d on d.id = h.district_id
      join public.hunt_participants m
        on m.hunt_id = h.id
       and m.user_id = auth.uid()
       and m.entfernt_am is null
       and (m.status = 'joined'
            or (m.status = 'left' and m.joined_at is not null))
     where h.district_id = p_district_id
       and h.creator_id = d.owner_id
       and case public.sicht_stufe(h.id)
             when 'leitung' then true
             when 'alles' then
                  m.status = 'joined'
                  and public.jagd_ist_offen(h.status, h.scheduled_for,
                                            h.scheduled_until)
             else false
           end
  );
$$;

-- INTERN (EXECUTE fuer niemanden; nach aussen nur ueber die ID-Funktionen
-- unten, Abweichung a). Sitzordnung, Stand-Bezug, Treiben-Staende
-- (E3-Tabelle, E4). Sichtbar ist:
-- - die eigene Zeile, immer;
-- - bei `eigener` und `umkreis` jede Zeile, die auf einen EIGENEN Stand
--   zeigt — Objekt oder Sitzzeile, also ueber IDs (E3, Codex 141 A2);
-- - bei `umkreis` dazu jede Zeile, deren Ort im Umkreis liegt. Der Ort ist
--   ihr Objekt, sofern es im Revier DIESER Jagd liegt UND in dieser Jagd
--   als Stand VERGEBEN ist (Sitzordnung oder Treiben-Stand — beides
--   schreibt nur die Leitung); sonst ihre Sitzzeile dieser Jagd (Objekt
--   bzw. Ad-hoc-Ort). Grund: der Stand-Bezug zeigt auf ein Objekt, das der
--   Teilnehmer SELBST waehlt (`stand_bezug_own`). Ohne die Vergabe-Bedingung
--   loggt sich A auf eine verborgene Objekt-ID ein, und B erfaehrt an der
--   Sichtbarkeit von A's Bezug-Zeile, ob das Objekt in seinem Umkreis liegt
--   (Codex 141 Delta 4 [hoch]). Mit ihr verraet die Zeile hoechstens, was die
--   vergebenen Stand-Zeilen ohnehin zeigen.
-- Treiber sehen nur eigene Zeilen (V4). Es sind Jagd-Daten, also gilt kein
-- Fenster aus V7 (E6).
create function public.stand_zeile_in_sicht(p_hunt_id uuid,
                                            p_objekt uuid,
                                            p_sitz uuid,
                                            p_teilnehmer uuid,
                                            p_nutzer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    p_nutzer = auth.uid()
    or exists (select 1 from public.hunt_participants p
                where p.id = p_teilnehmer and p.user_id = auth.uid())
    or st.stufe in ('leitung', 'alles')
    or (st.stufe in ('eigener', 'umkreis')
        and exists (select 1
                      from public.staende_der_teilnahme(
                             public.meine_teilnahme(p_hunt_id)) e
                     where e.objekt_id = p_objekt or e.sitz_id = p_sitz))
    or (st.stufe = 'umkreis'
        and public.ort_in_umkreis(p_hunt_id, coalesce(
              (select o.position
                 from public.map_objects o
                 join public.hunts h on h.id = p_hunt_id
                where o.id = p_objekt
                  and o.district_id = h.district_id
                  and o.deleted_at is null
                  and (exists (select 1
                                 from public.hunt_seat_assignments s2
                                where s2.hunt_id = p_hunt_id
                                  and s2.seat_id = o.id)
                       or exists (select 1
                                    from public.hunt_drive_stands ds2
                                    join public.hunt_drives d2
                                      on d2.id = ds2.drive_id
                                   where d2.hunt_id = p_hunt_id
                                     and ds2.map_object_id = o.id))),
              (select case
                        when s.seat_id is null then
                             st_setsrid(st_makepoint(s.position_lng,
                                                     s.position_lat), 4326)
                        else o.position
                      end
                 from public.hunt_seat_assignments s
                 join public.hunts h on h.id = s.hunt_id
                 left join public.map_objects o
                        on o.id = s.seat_id
                       and o.district_id = h.district_id
                       and o.deleted_at is null
                where s.id = p_sitz
                  and s.hunt_id = p_hunt_id)))),
    false)
    from (select public.sicht_stufe(p_hunt_id) as stufe) st;
$$;

-- INTERN, wie oben. Anblicke und Erlegungen (E3-Tabelle, V9). Beim
-- Umkreis entscheidet der Ort des SCHUETZEN (`wild_events.location`, `kills.position`), nie der
-- Tierort: gaebe der Tierort die Zeile frei, kaeme der Schuetzenort mit
-- (Schlusslesung P1). Treiber sehen die Meldungen von Treibern (E4), nicht
-- die eines Treibers, der am Stand steht (V13, V15; seine Meldung traegt
-- den Stand). ⚠ Geprueft wird beim LESEN, nicht beim Melden (benannter
-- Rest, Codex 141 Delta 4).
-- Jagd-Daten, also kein Fenster aus V7.
create function public.meldung_in_sicht(p_hunt_id uuid,
                                        p_ort geometry,
                                        p_melder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    p_melder = auth.uid()
    or case public.sicht_stufe(p_hunt_id)
         when 'leitung' then true
         when 'alles'   then true
         when 'treiber' then exists (
              select 1 from public.hunt_participants p
               where p.hunt_id = p_hunt_id
                 and p.user_id = p_melder
                 and p.role = 'treiber'
                 and p.entfernt_am is null
                 and not public.steht_am_stand(p.id))
         when 'umkreis' then public.ort_in_umkreis(p_hunt_id, p_ort)
         else false
       end,
    false);
$$;

-- Die Zeilen-Funktionen fuer die Policies: NUR die ID, alles andere aus
-- der gespeicherten Zeile (Abweichung a). Unbekannte ID → `false`.
-- Jede traegt die VOLLEN Bedingungen ihrer Policy (Teilnahme, `joined`,
-- `type`, `kill_visibility`), nicht nur die Sichtregel: sonst verriete die
-- RPC mehr als ein `select` (Codex 141 Delta 2). Die Policies behalten
-- ihre Bedingungen trotzdem — als billigen Vorfilter vor dem Aufruf.
-- ⚠ STABLE sieht den Schnappschuss vom Anweisungsbeginn: bei INSERT …
-- RETURNING findet die Funktion die NEUE Zeile nicht. Jeder Schreiber
-- braucht deshalb eine EIGENE Lese-Policy: joined Jagdleiter (`*_leader_all`),
-- Ersteller (`*_creator_select`, unten neu), `kills_reporter`,
-- `wild_events_owner_all`, `stand_bezug_own`. Ohne die zweite Gruppe
-- scheiterte ein Ersteller mit Rolle `schuetze` an `.insert().select()`
-- eines Ad-hoc-Stands (`seats.ts:78`, Codex 141 Delta 6).
create function public.sitz_in_sicht(p_sitz uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select (s.user_id = auth.uid()
            and s.hunt_id in (select public.get_my_teilnahme_hunt_ids()))
        or (s.hunt_id in (select public.get_my_joined_hunt_ids())
            and public.stand_zeile_in_sicht(s.hunt_id, s.seat_id, s.id, null,
                                            s.user_id))
      from public.hunt_seat_assignments s
     where s.id = p_sitz), false);
$$;

create function public.bezug_in_sicht(p_teilnehmer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select b.hunt_id in (select public.get_my_joined_hunt_ids())
           and public.stand_zeile_in_sicht(b.hunt_id, b.map_object_id,
                                           b.seat_assignment_id,
                                           b.participant_id, null)
      from public.hunt_stand_bezug b
     where b.participant_id = p_teilnehmer), false);
$$;

create function public.treiben_stand_in_sicht(p_stand uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select d.hunt_id in (select public.get_my_teilnahme_hunt_ids())
           and public.stand_zeile_in_sicht(d.hunt_id, ds.map_object_id,
                                           ds.seat_assignment_id,
                                           ds.participant_id, null)
      from public.hunt_drive_stands ds
      join public.hunt_drives d on d.id = ds.drive_id
     where ds.id = p_stand), false);
$$;

create function public.anblick_in_sicht(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select w.type = 'sighting'::wild_event_type
           and w.hunt_id in (select public.get_my_teilnahme_hunt_ids())
           and public.meldung_in_sicht(w.hunt_id, w.location::geometry, w.user_id)
      from public.wild_events w
     where w.id = p_id), false);
$$;

create function public.erlegung_in_sicht(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((
    select ((k.hunt_id in (select public.get_my_teilnahme_hunt_ids())
             and h.kill_visibility = 'all'::kill_visibility)
            or (k.hunt_id in (select public.get_my_joined_hunt_ids_as_leader_or_groupleader())
                and h.kill_visibility = 'leader_and_groupleader'::kill_visibility))
           and public.meldung_in_sicht(k.hunt_id, k.position, k.reporter_id)
      from public.kills k
      join public.hunts h on h.id = k.hunt_id
     where k.id = p_id), false);
$$;

revoke all on function public.stand_zeile_in_sicht(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.meldung_in_sicht(uuid, geometry, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.objekt_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.zonen_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.sitz_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bezug_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.treiben_stand_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.anblick_in_sicht(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.erlegung_in_sicht(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.objekt_in_sicht(uuid) to authenticated;
grant execute on function public.zonen_in_sicht(uuid) to authenticated;
grant execute on function public.sitz_in_sicht(uuid) to authenticated;
grant execute on function public.bezug_in_sicht(uuid) to authenticated;
grant execute on function public.treiben_stand_in_sicht(uuid) to authenticated;
grant execute on function public.anblick_in_sicht(uuid) to authenticated;
grant execute on function public.erlegung_in_sicht(uuid) to authenticated;

-- Abweichung g): kein Policy-Aufrufer mehr, kein Client-Aufrufer.
revoke all on function public.jagd_deckt_objekt(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Policies
-- ---------------------------------------------------------------------------

-- Der Ersteller schreibt Sitzordnung und Treiben-Staende seiner Jagd
-- (`seat_assignments_creator_*`, `drive_stands_creator_*`), konnte sie aber
-- nur ueber eine Teilnehmer- oder Leiter-Policy lesen. Seit die
-- Teilnehmer-Policy eine Zeilenfunktion ruft, die die eigene neue Zeile
-- nicht sieht (s. §4), braucht er eine eigene (Abweichung h).
create policy seat_assignments_creator_select on public.hunt_seat_assignments
  for select to authenticated
  using (hunt_id in (select hunts.id from public.hunts
                      where hunts.creator_id = auth.uid()));

create policy drive_stands_creator_select on public.hunt_drive_stands
  for select to authenticated
  using (drive_id in (select d.id
                        from public.hunt_drives d
                        join public.hunts h on h.id = d.hunt_id
                       where h.creator_id = auth.uid()));

alter policy map_objects_hunt_member on public.map_objects
  to authenticated
  using (deleted_at is null and public.objekt_in_sicht(id));

alter policy zones_hunt_member on public.zones
  to authenticated
  using (public.zonen_in_sicht(district_id));

-- Eigene Sitzzeilen ueber die TEILNAHME (joined ODER left) — sonst fehlt
-- einem `left`-Gast sein Stand im Tagebuch (Codex P6). Fremde Zeilen wie
-- bisher nur fuer `joined`.
alter policy seat_assignments_participant_select on public.hunt_seat_assignments
  to authenticated
  using (
    (user_id = auth.uid()
     and hunt_id in (select public.get_my_teilnahme_hunt_ids()))
    or (hunt_id in (select public.get_my_joined_hunt_ids())
        and public.sitz_in_sicht(id))
  );

alter policy stand_bezug_hunt_member on public.hunt_stand_bezug
  to authenticated
  using (
    hunt_id in (select public.get_my_joined_hunt_ids())
    and public.bezug_in_sicht(participant_id)
  );

alter policy drive_stands_participant_select on public.hunt_drive_stands
  to authenticated
  using (
    exists (select 1
              from public.hunt_drives d
             where d.id = hunt_drive_stands.drive_id
               and d.hunt_id in (select public.get_my_teilnahme_hunt_ids()))
    and public.treiben_stand_in_sicht(id)
  );

alter policy wild_events_hunt_member on public.wild_events
  to authenticated
  using (
    type = 'sighting'::wild_event_type
    and hunt_id in (select public.get_my_teilnahme_hunt_ids())
    and public.anblick_in_sicht(id)
  );

-- `kill_visibility` bleibt und wirkt ZUSAETZLICH (UND), ohne Schalter (E1).
alter policy kills_visibility_all on public.kills
  to authenticated
  using (
    hunt_id in (select public.get_my_teilnahme_hunt_ids())
    and (select h.kill_visibility from public.hunts h
          where h.id = kills.hunt_id) = 'all'::kill_visibility
    and public.erlegung_in_sicht(id)
  );

-- Sonst saehe ein Gruppenleiter mit `wie_schuetzen` bei
-- `leader_and_groupleader` alles (Codex P1).
alter policy kills_visibility_leader_groupleader on public.kills
  to authenticated
  using (
    hunt_id in (select public.get_my_joined_hunt_ids_as_leader_or_groupleader())
    and (select hunts.kill_visibility from public.hunts
          where hunts.id = kills.hunt_id) = 'leader_and_groupleader'::kill_visibility
    and public.erlegung_in_sicht(id)
  );

-- ---------------------------------------------------------------------------
-- 6. Live-Punkte und Wege — je Teilnehmer (E5)
-- ---------------------------------------------------------------------------
-- Unveraendert bis auf die letzte Zeile je Funktion. Die Regel aus 133
-- (Drueckjagd: nur Treiber-Wege, Frist, Consent) gilt VOR der Stufe.

create or replace function public.live_sichtbare_teilnahmen()
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
     and public.teilnahme_in_sicht(hp.id)
$$;

create or replace function public.weg_sichtbare_teilnahmen()
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
     and public.teilnahme_in_sicht(hp.id)
$$;

-- ---------------------------------------------------------------------------
-- 7. Umsetzen in EINER Transaktion (E3, Codex Delta 2 P4)
-- ---------------------------------------------------------------------------
-- INVOKER: die Rechte kommen aus den bestehenden Leiter-/Ersteller-Policies.
-- Heute setzen `assignAdhocSeat` und `assignDriveStand` in zwei Anfragen um
-- (UNIQUE (hunt_id, user_id) bzw. der Teilindex aus 061 erzwingen die
-- Reihenfolge). Dazwischen waere ein Hundefuehrer "ohne Stand" und damit
-- fuer alle sichtbar; scheiterte die zweite Anfrage, bliebe er es.
-- Hier nimmt ein Fehler beide Schritte zurueck. 0 umgesetzte Zeilen sind
-- ein Fehler, kein Erfolg (S1): unsichtbare Zeile → `P0002`, fehlendes
-- Schreibrecht → `42501`.

create function public.stand_umsetzen(p_sitz uuid, p_nutzer uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hunt uuid;
  v_n    integer;
begin
  select s.hunt_id into v_hunt
    from public.hunt_seat_assignments s
   where s.id = p_sitz;
  if v_hunt is null then
    raise exception 'Stand existiert nicht mehr' using errcode = 'P0002';
  end if;
  if p_nutzer is not null then
    update public.hunt_seat_assignments
       set user_id = null
     where hunt_id = v_hunt
       and user_id = p_nutzer
       and id <> p_sitz;
  end if;
  update public.hunt_seat_assignments
     set user_id = p_nutzer
   where id = p_sitz;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Stand nicht umgesetzt' using errcode = '42501';
  end if;
end;
$$;

create function public.treiben_stand_umsetzen(p_stand uuid, p_teilnahme uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_treiben uuid;
  v_n       integer;
begin
  select ds.drive_id into v_treiben
    from public.hunt_drive_stands ds
   where ds.id = p_stand;
  if v_treiben is null then
    raise exception 'Stand existiert nicht mehr' using errcode = 'P0002';
  end if;
  if p_teilnahme is not null then
    update public.hunt_drive_stands
       set participant_id = null
     where drive_id = v_treiben
       and participant_id = p_teilnahme
       and id <> p_stand;
  end if;
  update public.hunt_drive_stands
     set participant_id = p_teilnahme
   where id = p_stand;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Stand nicht umgesetzt' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.stand_umsetzen(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.treiben_stand_umsetzen(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.stand_umsetzen(uuid, uuid) to authenticated;
grant execute on function public.treiben_stand_umsetzen(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Kommentare
-- ---------------------------------------------------------------------------

comment on column public.hunts.schuetzen_sicht is
  'CN-278 (141): was Schuetzen sehen — alles / umkreis / eigener. Wirkt in RLS (objekt_in_sicht, zonen_in_sicht, sitz_/bezug_/treiben_stand_/anblick_/erlegung_in_sicht, teilnahme_in_sicht). Beim Anlegen aus user_settings.sicht_vorgabe_schuetzen.';
comment on column public.hunts.sicht_umkreis_m is
  'CN-278 (141): Radius fuer schuetzen_sicht = umkreis, in Metern um jeden eigenen Stand.';
comment on column public.hunts.gruppenleiter_sicht is
  'CN-278 (141): alles = Schuetzen mit Tag gruppenleiter sehen alles; wie_schuetzen = wie jeder Schuetze. Obertreiber fallen unter die Treiber-Regel (V10).';
comment on column public.user_settings.sicht_vorgabe_schuetzen is
  'CN-278 (141): Grundeinstellung fuer neue Jagden; trg_hunts_sicht_vorgabe kopiert sie beim INSERT.';
comment on column public.user_settings.sicht_vorgabe_umkreis_m is
  'CN-278 (141): Grundeinstellung Radius fuer neue Jagden.';
comment on column public.user_settings.sicht_vorgabe_gruppenleiter is
  'CN-278 (141): Grundeinstellung Gruppenleiter fuer neue Jagden.';
comment on column public.user_settings.grundkarte is
  'CN-358 (141): topo / luftbild; null = am Konto noch nie gewaehlt, das Geraet entscheidet. Keine Policy wertet die Spalte aus.';
comment on column public.hunt_participants.stand_id is
  'Altlast aus 003, seit 141 per CHECK stillgelegt (stand_id is null): der eigene Stand kommt aus Sitzordnung und Treiben-Staenden (CN-278, E3).';

commit;
