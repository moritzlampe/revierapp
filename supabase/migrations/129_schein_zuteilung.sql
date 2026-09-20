-- 129_schein_zuteilung.sql — CN-211 Paket A, CN-212, CN-213
--
-- Ein Begehungsschein bekommt eine ZUTEILUNG, die wirklich beschränkt — und
-- einen Einlösecode, den man am Telefon vorlesen kann.
--
-- Anlass (Moritz, 20.09.2026), drei Sätze, drei Teile dieser Datei:
--   "ganzes Revier, einzelne Bereiche (mit den ständen die da drin sind)
--    oder nur einzelne stände"
--   "Wirklich beschränken"
--   "Ja ein Bereichsschein ist etwas wie eine Reviergrenze für den
--    Begehungsscheininhaber"
--   "nur 4 stellig reicht würde ich sagen und nur zahlen?" (nach der
--    Rate-Rechnung auf 8 Ziffern erhöht)
--
-- ============================================================================
-- DER BAUPLAN IST VOR DIESER DATEI GEPRÜFT WORDEN (F14)
-- ============================================================================
-- Vollständige Begründung: docs/konzepte/QuickHunt_Bauplan_Schein_Ausstellen_
-- Nativ_V1.md (quickhunt-native), §3 Paket A, §9 Prüfergebnis V1.
--
-- V1 ging an Codex UND die Schlusslesung, beide `needs-attention`, 15
-- Findings. Beide fanden unabhängig denselben Blocker: die Route
-- `/einladung/<code>` existiert nicht — sie stand in einem GELOCKTEN Konzept
-- als "nachgezogen 30.07.2026" und war nie gebaut. Ein gelocktes Dokument
-- beschreibt eine Absicht, keinen Bestand.
--
-- ⛔ E-A3c — der Teil, den KEINER der beiden Prüfer sehen konnte, weil V1 ihn
-- gar nicht erwähnte: V1 beschränkte nur `map_objects_jes_select`. Das ist
-- EINE von fünf Policies, über die ein Scheininhaber an Kartenobjekte kommt,
-- und RLS verknüpft sie mit ODER. Die vier `map_objects_creator_*` hängen an
-- `kann_revier_pflegen()` (077), und die kennt im Wortlaut nur "aktiver
-- Schein auf dieses Revier" — keinen Ort, keine Zuteilung.
--
-- Ein Bereichsschein-Inhaber hätte danach weiterhin ÜBERALL im Revier
-- Kartenobjekte anlegen dürfen, sie über `creator_select` an der neuen
-- Schranke vorbei gesehen und sie überall ändern und löschen können. Fremde
-- Objekte nicht — alle vier verlangen zusätzlich `created_by = auth.uid()`.
-- Es wäre also keine Offenlegung gewesen, sondern eine PFLEGE-BEFUGNIS
-- AUSSERHALB DER EIGENEN GRENZE.
--
-- Das ist die Bauform vom 31.07.2026, dreimal an einem Tag: "Die Leserechte
-- waren beide Male sorgfältig gebaut; die Schreibseite hatte niemand
-- angesehen." Eine Grenze, die man überschreiten darf, solange man hinterher
-- nichts sieht, ist keine.
--
-- ============================================================================
-- WAS DIESE MIGRATION FÜR DEN BESTAND BEDEUTET: NICHTS
-- ============================================================================
-- Heinrichs Schein auf L7 trägt `zone_ids = {}` UND `stand_ids = {}`, und das
-- heißt heute IMPLIZIT "ganzes Revier" — er SÄHE damit alle 32 Objekte.
-- Genau dieselben leeren Arrays hießen nach einer naiven Beschränkung "gar
-- nichts", und er verlöre alles, ohne dass jemand etwas geändert hätte.
--
-- ⛔ "SÄHE", nicht "sieht": DER SCHEIN IST SEIT DEM 30.08.2026 ABGELAUFEN
-- (`bb0e03d1-…`, valid_until 2026-08-30) — heute sieht Heinrich NULL Objekte,
-- `get_my_jes_district_ids()` liefert für ihn NULL. Die erste Fassung dieses
-- Kommentars behauptete "32" und hatte die Zahl als `postgres` gezählt: die
-- richtige Zahl über die falsche Achse (CP-91-Bauform). Gefunden von der
-- Schlusslesung (F1, 20.09.2026).
--
-- Deshalb trägt die Zuteilung eine EIGENE Spalte mit Default 'revier'. Der
-- gesamte Bestand bekommt sie; die Beschränkung greift ausschließlich dort,
-- wo sie ausdrücklich gewählt wurde. Additiv für Bestehendes, einschränkend
-- nur für Neues.
--
-- ⚠ Die Gegenproben stehen in `.review/gegenproben-129.sql` und verlängern
-- den Schein JEDES MAL innerhalb ihrer eigenen Transaktion. Ohne das messen
-- 8 von 15 Proben einen abgelaufenen Schein — und zwei davon (P6 erwartet 0,
-- P8 erwartet 42501) würden GRÜN, ohne dass 129 je gefragt worden wäre.
--
-- ============================================================================
-- TESTDATEN — die Annahme ist gemessen, nicht angenommen
-- ============================================================================
-- Vor dem 20.09.2026 hatte KEIN Revier Zonen UND Stände zugleich: "Bereich mit
-- den Ständen darin" war nicht prüfbar. Drei `begehungsbezirk`-Zonen in L7
-- (Freigabe Moritz) schließen die Lücke:
--   Testbezirk West  dd77dd77-0001-4000-8000-000000000001  23 Objekte
--   Testbezirk Ost   dd77dd77-0001-4000-8000-000000000002   9 Objekte
--   Testbezirk Leer  dd77dd77-0001-4000-8000-000000000003   0 Objekte
-- 23 + 9 + 0 = 32, überschneidungsfrei — genau die Zahl, die Heinrichs
-- Schein deckte, als er noch galt. Das 33. Objekt liegt im Papierkorb
-- und fällt richtig heraus.
--
-- Rechenzeit gemessen (`explain analyze`, Söders 196 Objekte gegen 2 Zonen,
-- 392 Aufrufe ohne einen einzigen Treffer, also ohne Frühabbruch): 0,5 ms.
-- Ein GiST-Index auf `zones.polygon` wäre Überbau — die Zonenliste kommt aus
-- `zone_ids` und ist klein, gescannt werden die Objekte.
-- (Die Messung lief mit st_contains, die Funktion nutzt st_covers: dieselbe
--  Kostenklasse, derselbe GEOS-Prädikatpfad.)

\set ON_ERROR_STOP on

begin;

-- ============================================================================
-- TEIL 1 — Die Zuteilung als eigene Spalte
-- ============================================================================

alter table public.hunting_licenses
  add column zuteilung text not null default 'revier';

alter table public.hunting_licenses
  add constraint hunting_licenses_zuteilung_check
    check (zuteilung in ('revier', 'bereiche', 'staende'));

comment on column public.hunting_licenses.zuteilung is
  'Wie weit der Schein reicht: revier = das ganze Revier (Default, der '
  'gesamte Bestand vor Migration 129); bereiche = nur die Zonen aus '
  'zone_ids UND alles, was räumlich darin liegt; staende = nur die '
  'Kartenobjekte aus stand_ids. AUSDRÜCKLICH und nicht implizit über leere '
  'Arrays: zone_ids = {} bedeutete vor 129 "ganzes Revier" und hieße nach '
  'einer naiven Beschränkung "gar nichts" — eine Rechteänderung ohne '
  'Handlung. Wer die Spalte liest, darf die Arrays NICHT allein befragen.';

comment on column public.hunting_licenses.zone_ids is
  'Die zugeteilten Bereiche. Wirkt nur bei zuteilung = ''bereiche''. Seit '
  '129 steuert die Spalte nicht mehr bloß, welche Zonen-UMRISSE der Inhaber '
  'sieht (zones_jes_select, 077), sondern welche KARTENOBJEKTE — räumlich '
  'über st_covers, nicht über stand_ids. Ein später gebauter Hochsitz im '
  'zugeteilten Bereich ist damit automatisch erfasst; würde man die Stände '
  'beim Ausstellen einfrieren, wäre er es nicht, und niemand sähe warum.';

comment on column public.hunting_licenses.stand_ids is
  'Die zugeteilten Kartenobjekte. Wirkt nur bei zuteilung = ''staende''. Vor '
  '129 wertete KEINE Policy diese Spalte aus (grep über alle 122 '
  'Migrationen) — sie stand da und tat nichts.';

-- ============================================================================
-- TEIL 2 — Ein Code, den man vorlesen kann (CN-213)
-- ============================================================================
-- Heute: translate(encode(gen_random_bytes(9),'base64'),'+/','-_') — 12
-- Zeichen mit Groß-/Kleinschreibung, am Telefon unzumutbar.
--
-- ⛔ Warum 8 Ziffern und nicht 4 (Moritz' Ausgangswunsch): schein_einloesen()
-- prüft AUSSCHLIESSLICH den Code — keine Adresse, kein Versuchszähler —, und
-- trg_hunting_licenses_holder_fixieren macht holder_id danach
-- unveränderlich. Ein geratener Treffer ist NICHT rückgängig zu machen: der
-- echte Empfänger kommt nie mehr hinein, und der Rater hat über
-- kann_revier_pflegen() Schreibrecht auf die Karte. 4 Ziffern sind 10.000
-- Möglichkeiten — Minuten. 8 Ziffern sind 100 Millionen.
--
-- Eine Adressbindung als Ersatz trägt NICHT: stimmt die Adresse, zeigt
-- meine_einladungen() (080) den Schein ohnehin von selbst. Der Code ist
-- genau für den Fall da, dass sie nicht stimmt.
--
-- ⚠ Alte Codes bleiben gültig — schein_einloesen sucht per Gleichheit, nicht
-- per Format. Die offenen Söder-Scheine behalten ihre langen.
--
-- ⚠ Der Modulo ist nicht exakt gleichverteilt (2^32 ist kein Vielfaches von
-- 10^8), die Abweichung liegt bei rund 7 %. Für die Ratesicherheit ohne
-- Belang; Rejection-Sampling wäre hier Überbau.
--
-- ⚠ Der Vorschlag aus dem Bauplan (`gen_random_bytes(4)::bit(32)::bigint`)
-- LÄUFT NICHT: "cannot cast type bytea to bit" (42846, gemessen). Deshalb
-- get_byte() — garantiert vorzeichenfrei, ohne Cast-Überraschung.

-- ⛔ DER DEFAULT MUSS WEG, SONST TUT DER GANZE TEIL 2 NICHTS.
-- Gefunden von der Fremdprüfung (Codex, 20.09.2026, Punkt 6) am
-- UNAPPLIZIERTEN Text — genau wofür Anker 2 da ist.
--
-- `invite_code` trägt seit 068 einen Spalten-Default (zwölf base64-Zeichen).
-- POSTGRES SETZT SPALTEN-DEFAULTS, BEVOR BEFORE-TRIGGER FEUERN. Beim
-- gewöhnlichen INSERT ohne invite_code wäre `new.invite_code` also niemals
-- NULL, der Trigger liefe in sein `return new` — und jeder neue Schein
-- bekäme weiter einen zwölfstelligen Code.
--
-- Die Bauform ist die bekannte: ein Riegel, der formal nie zuschlägt, sieht
-- aus wie ein Riegel. Die Migration wäre appliziert worden, CN-213 hätte als
-- erledigt gegolten, und aufgefallen wäre es erst, wenn Moritz einen Code
-- am Telefon vorlesen will.
alter table public.hunting_licenses
  alter column invite_code drop default;

-- Ein nackter DEFAULT kann bei einer Kollision nicht neu ziehen, invite_code
-- ist aber UNIQUE (hunting_licenses_invite_code_key). Also ein Trigger mit
-- Schleife.
--
-- ⚠ Dies ist der ERSTE BEFORE-INSERT-Trigger dieser Tabelle (gemessen: heute
-- zwei Trigger, beide BEFORE UPDATE). BEFORE-Trigger feuern ALPHABETISCH —
-- die 096-Falle. Der Name ist bewusst kurz gewählt: ein späterer Trigger,
-- der den Code PRÜFT statt ihn zu setzen, sortiert mit jedem längeren Namen
-- (`trg_hunting_licenses_code_*`) dahinter und sieht damit den fertigen Wert.
-- Ein Trigger, der VOR dem Setzer prüft, prüfte etwas, das nicht gespeichert
-- wird — und sähe weiterhin aus wie ein Riegel.

create or replace function public.hunting_licenses_code_setzen()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $$
declare
  kandidat text;
  roh      bytea;
begin
  -- Ein ausdrücklich mitgegebener Code bleibt stehen: die PWA schreibt heute
  -- keinen, aber ein Import oder eine Datenkorrektur darf es.
  if new.invite_code is not null then
    return new;
  end if;

  for i in 1..10 loop
    -- Acht Ziffern, kryptografisch zufällig, führende Null erlaubt (gemessen:
    -- 5000 Ziehungen, alle achtstellig, "00054200" kam vor). get_byte() statt
    -- eines bit-Casts, weil letzterer nicht läuft (s. Kopf).
    roh := extensions.gen_random_bytes(4);
    kandidat := lpad((
      (get_byte(roh, 0)::bigint * 16777216
     + get_byte(roh, 1)::bigint * 65536
     + get_byte(roh, 2)::bigint * 256
     + get_byte(roh, 3)::bigint) % 100000000
    )::text, 8, '0');

    if not exists (select 1 from public.hunting_licenses
                    where invite_code = kandidat) then
      new.invite_code := kandidat;
      return new;
    end if;
  end loop;

  -- ⚠ AKTIVE FALLE, benannt und bewusst NICHT gebaut (Fremdprüfung S6,
  -- 20.09.2026): die Existenzprüfung ist kein Riegel gegen Nebenläufigkeit.
  -- Zwei gleichzeitige INSERTs können denselben freien Kandidaten ziehen;
  -- der UNIQUE-Index verhindert das Duplikat, aber der zweite INSERT
  -- scheitert dann mit 23505, OHNE dass diese Schleife noch einmal läuft —
  -- der Konflikt entsteht nach dem Trigger, nicht in ihm.
  -- Nicht gebaut, weil die Rechnung dagegen steht: 100 Millionen Codes, vier
  -- Scheine im Bestand, und beide INSERTs müssten in dieselbe Millisekunde
  -- fallen. Der Ausgang ist ausserdem der harmlose — ein lauter Fehlschlag,
  -- kein doppelter Code. Wer es je schliessen will, braucht einen Retry um
  -- den INSERT herum (im Client oder in einer RPC), nicht mehr Schleife hier.
  --
  -- Nach zehn Fehlversuchen ist entweder der Zufall kaputt oder der
  -- Nummernraum voll. Beides ist ein lauter Fehler wert und kein stiller
  -- Erfolg mit doppeltem Code.
  raise exception 'Kein freier Einlösecode nach 10 Versuchen'
    using errcode = '23505';
end;
$$;

comment on function public.hunting_licenses_code_setzen() is
  'BEFORE INSERT auf hunting_licenses: setzt invite_code auf acht Ziffern, '
  'mit Kollisionsschleife (invite_code ist UNIQUE). SECURITY DEFINER, weil '
  'die Existenzprüfung ALLE Scheine sehen muss — der Aussteller sieht per '
  'RLS nur die eigenen, und eine Kollision mit einem fremden Code fiele '
  'sonst erst am Unique-Index auf. Die Funktion gibt nichts über fremde '
  'Scheine preis: sie liefert nur den gesetzten Code zurück.';

-- ⛔ 082-ENTZUG — von der Fremdprüfung gefunden (S3, 20.09.2026).
-- Diese Funktion ist SECURITY DEFINER und eine TRIGGER-Funktion: wer sie
-- ausführen darf, darf sie an eine EIGENE temporäre Tabelle hängen und
-- `new` frei bestimmen. Genau dieser Angriff ist am 31.07.2026 nachgestellt
-- worden (062/082), und 082 hat ihn für alle 14 damaligen Trigger-Funktionen
-- geschlossen. Eine neue Trigger-Funktion muss den Entzug selbst mitbringen.
--
-- ⚠ Die Ironie, die hier festgehalten gehört: der erste Entwurf trug das
-- 082-Muster an den zwei POLICY-Helfern, wo es die Karte getötet hätte — und
-- nicht an der Trigger-Funktion, wo es hingehört. Beide Male dieselbe Regel,
-- beide Male am falschen Ort. Der Unterschied ist, WER die Funktion ruft:
-- eine Policy ruft sie als der Nutzer (braucht EXECUTE), ein Trigger ruft
-- sie als das System (braucht es nicht).
--
-- `REVOKE ... FROM PUBLIC` allein entzöge NICHTS — Supabase vergibt EXECUTE
-- per ALTER DEFAULT PRIVILEGES ausdrücklich an die drei Rollen. Sie müssen
-- namentlich genannt werden.
revoke execute on function public.hunting_licenses_code_setzen()
  from public, anon, authenticated, service_role;

create trigger trg_hunting_licenses_code
  before insert on public.hunting_licenses
  for each row
  execute function public.hunting_licenses_code_setzen();

-- ============================================================================
-- TEIL 3 — Die Zuteilung wirkt: Lesen
-- ============================================================================
-- ⚠ "bereiche" rechnet RÄUMLICH, nicht über stand_ids — Moritz' Wortlaut
-- "einzelne Bereiche (mit den ständen die da drin sind)" heißt: die Stände
-- folgen dem Bereich, auch die künftigen.
--
-- ⚠ Zonen dürfen sich überlappen. Ein Objekt in zwei zugeteilten Bereichen
-- ist einmal sichtbar, nicht zweimal — deshalb `exists`, kein `join`.
--
-- ⚠ Mehrere Scheine desselben Inhabers auf dasselbe Revier ergeben die
-- VEREINIGUNG ihrer Zuteilungen. Das ist der harmlose Ausgang: ein zweiter,
-- engerer Schein nimmt niemandem etwas weg.
--
-- ⚠ Rechteausweitung durch Datenpflege, geprüft (Bauplan O6): wird eine Zone
-- gelöscht, auf die zone_ids zeigt, sieht der Inhaber WENIGER — die id bleibt
-- stehen und trifft nichts. Wandert ein Stand in den Papierkorb, filtert
-- `deleted_at is null` ihn ohnehin. Beide Richtungen zeigen nach innen; es
-- gibt keinen Pfad, auf dem Pflege den Schein erweitert.

create or replace function public.schein_deckt_objekt(
  p_district_id uuid,
  p_object_id   uuid,
  p_position    geography
) returns boolean
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from hunting_licenses hl
     where hl.holder_id = auth.uid()
       and hl.status = 'aktiv'::jes_status
       and current_date between hl.valid_from and hl.valid_until
       and hl.district_id = p_district_id
       and (
             hl.zuteilung = 'revier'
          or (hl.zuteilung = 'staende'
              and p_object_id = any (hl.stand_ids))
          -- ⚠ st_covers, NICHT st_contains (Fremdprüfung Punkt 11,
          -- 20.09.2026). st_contains schliesst RANDPUNKTE aus: ein Stand
          -- genau auf der gemeinsamen Kante zweier angrenzender Bereiche
          -- wäre damit in KEINEM von beiden sichtbar. Gemessen an zwei
          -- Rechtecken mit gemeinsamer Kante bei 10.41: contains → false /
          -- false, covers → true / true. Die Doppelnennung ist harmlos, weil
          -- `exists` einmal zählt und nicht zweimal.
          -- Moritz' Wortlaut ist "einzelne Bereiche (mit den ständen die da
          -- drin sind)" — ein Stand auf der Linie ist drin, nicht nirgends.
          or (hl.zuteilung = 'bereiche'
              and exists (select 1 from zones z
                           where z.id = any (hl.zone_ids)
                             and z.district_id = p_district_id
                             and st_covers(z.polygon::geometry,
                                           p_position::geometry)))
         )
  );
$$;

comment on function public.schein_deckt_objekt(uuid, uuid, geography) is
  'Deckt ein BEGEHUNGSSCHEIN des Aufrufers dieses Kartenobjekt? Ersetzt seit '
  '129 den nackten Revier-Vergleich in map_objects_jes_select. '
  '⛔ SIE KENNT DEN REVIERBESITZER NICHT und gibt ihm für seine eigenen '
  'Objekte FALSE — er kommt über map_objects_owner_* und über den '
  'ausdrücklichen Besitzer-Zweig in darf_hier_pflegen und '
  'papierkorb_kartenobjekte. Der erste Entwurf dieser Migration setzte sie '
  'im Papierkorb ALLEIN ein und hätte dem Besitzer seinen eigenen '
  'Papierkorb genommen. Deshalb heißt sie "schein_deckt_..." und nicht '
  '"darf_...": der Name nennt seine Grenze, weil die Schwesterfunktion '
  'darf_hier_pflegen beide Zweige hat und die Asymmetrie sonst niemand '
  'sieht. SECURITY DEFINER wie get_my_jes_district_ids '
  '(077) — der Inhaber darf seinen eigenen Schein per RLS zwar lesen '
  '(hunting_licenses_holder), die Zonen des Reviers aber nicht zwingend. '
  'pg_temp steht am ENDE des search_path (076): ungenannt würde das '
  'Temp-Schema ZUERST durchsucht, und authenticated darf temporäre Tabellen '
  'anlegen — eine vorgetäuschte hunting_licenses hätte die Funktion sonst '
  'belogen.';

-- ⛔ HIER STAND EIN RIEGEL, DER DIE KARTE GETÖTET HÄTTE.
-- Der erste Entwurf entzog EXECUTE "from public, anon, authenticated,
-- service_role" — nach dem 082-Muster für Trigger-Funktionen. Das ist hier
-- falsch, und zwar laut: POLICY-AUSDRÜCKE LAUFEN MIT DEN RECHTEN DES
-- AUFRUFERS. Ohne EXECUTE für `authenticated` wird aus jeder Kartenabfrage
-- ein hartes 42501 — nicht nur für Scheininhaber, sondern über
-- map_objects_creator_* auch für den REVIERBESITZER, der dann kein einziges
-- Objekt mehr anlegen könnte.
--
-- Die Vorbilder sagen es: get_my_jes_district_ids und kann_revier_pflegen
-- tragen beide `authenticated=X, service_role=X` und NUR anon ist entzogen
-- (gemessen an pg_proc.proacl, 20.09.2026). 082 gilt für Funktionen, die
-- NIEMAND direkt ruft; diese hier ruft die Policy bei jedem Kartenaufruf.
--
-- anon bleibt außen vor, weil beide Policies `to authenticated` tragen —
-- und weil eine Funktion, auf die anon kein EXECUTE hat, aus einer
-- anon-Policy einen Serverfehler statt einer leeren Liste machte (069).
revoke execute on function public.schein_deckt_objekt(uuid, uuid, geography)
  from public, anon;

drop policy if exists map_objects_jes_select on public.map_objects;

create policy map_objects_jes_select on public.map_objects
  for select to authenticated
  using (
    district_id in (select get_my_jes_district_ids())
    and deleted_at is null
    and schein_deckt_objekt(district_id, id, position)
  );

-- ============================================================================
-- TEIL 4 — Die Zuteilung wirkt: Schreiben (E-A3c)
-- ============================================================================
-- Ohne diesen Teil wäre Teil 3 eine Anzeige-Einstellung. S2 des
-- Standard-Focus fragt bei jedem Lauf genau danach: gibt es einen
-- Schreibpfad ohne Gate?
--
-- ⚠ kann_revier_pflegen() selbst bleibt UNVERÄNDERT. Sie hat keinen
-- Ortsparameter und wird auch dort gerufen, wo es kein Objekt gibt; sie zu
-- erweitern hieße, alle ihre Leser auf einmal zu ändern. Der neue Helfer
-- steht daneben und wird gezielt in den vier map_objects-Policies gerufen.

create or replace function public.darf_hier_pflegen(
  p_district_id uuid,
  p_position    geography
) returns boolean
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select exists (
           select 1 from districts
            where id = p_district_id and owner_id = auth.uid()
         )
      or schein_deckt_objekt(p_district_id, null::uuid, p_position);
$$;

comment on function public.darf_hier_pflegen(uuid, geography) is
  'Ortsbezogene Schwester von kann_revier_pflegen() (077), seit 129 in den '
  'vier map_objects_creator_*-Policies. Der Revierbesitzer antwortet wie '
  'bisher. Ein Scheininhaber mit zuteilung = ''revier'' ebenfalls — der '
  'gesamte Bestand ist unberührt. Ohne diese Funktion dürfte ein '
  'Bereichsschein-Inhaber überall im Revier Objekte anlegen, sie über '
  'map_objects_creator_select an der Leseschranke vorbei sehen und sie '
  'überall ändern — eine Pflege-Befugnis außerhalb der eigenen Grenze. '
  'SIE BAUT DIE RANGFOLGE NICHT NACH, SONDERN RUFT SIE: schein_deckt_objekt '
  'mit p_object_id = NULL. Zwei Fassungen derselben Rangfolge sind eine zu '
  'viel — ein späterer Zuteilungstyp, der nur in einer von beiden landet, '
  'wäre ein Riegel, der auf der anderen Seite offen steht. Das NULL ist '
  'dabei tragend und gemessen: "null = any(stand_ids)" ergibt NULL bei '
  'gefülltem und false bei leerem Array, im exists() beide Male FALSE — bei '
  'zuteilung = ''staende'' gibt es also keine Pflegefläche. Das ist eine '
  'Entscheidung, keine Lücke: wer eine Liste vorhandener Stände zugeteilt '
  'bekommt, pflegt die Karte nicht.';

-- Dieselbe Begründung wie bei schein_deckt_objekt: authenticated MUSS ausführen
-- dürfen, sonst bricht map_objects_creator_* für jeden — auch für den
-- Revierbesitzer.
revoke execute on function public.darf_hier_pflegen(uuid, geography)
  from public, anon;

-- Die vier Policies behalten ihren Zuschnitt zeichengleich; getauscht wird
-- ausschließlich kann_revier_pflegen(district_id) gegen
-- darf_hier_pflegen(district_id, position).

drop policy if exists map_objects_creator_select on public.map_objects;
create policy map_objects_creator_select on public.map_objects
  for select to authenticated
  using (created_by = auth.uid()
         and (district_id is null or darf_hier_pflegen(district_id, position))
         and deleted_at is null);

drop policy if exists map_objects_creator_insert on public.map_objects;
create policy map_objects_creator_insert on public.map_objects
  for insert to authenticated
  with check (created_by = auth.uid()
              and (district_id is null
                   or darf_hier_pflegen(district_id, position))
              and deleted_at is null);

drop policy if exists map_objects_creator_update on public.map_objects;
create policy map_objects_creator_update on public.map_objects
  for update to authenticated
  using (created_by = auth.uid()
         and (district_id is null or darf_hier_pflegen(district_id, position))
         and deleted_at is null)
  with check (created_by = auth.uid()
              and (district_id is null
                   or darf_hier_pflegen(district_id, position))
              and deleted_at is null);

drop policy if exists map_objects_creator_delete on public.map_objects;
create policy map_objects_creator_delete on public.map_objects
  for delete to authenticated
  using (created_by = auth.uid()
         and (district_id is null or darf_hier_pflegen(district_id, position))
         and deleted_at is null);

-- ============================================================================
-- TEIL 5 — Die zwei Wege, die NICHT über eine Policy laufen
-- ============================================================================
-- Die vier Policies oben sind nicht alles. Zwei SECURITY-DEFINER-Funktionen
-- rufen kann_revier_pflegen() ebenfalls und umgehen RLS per Konstruktion —
-- wer nur die Policies zählt, hält die Fläche für geschlossen und irrt sich
-- um genau diese zwei. Gefunden durch `pg_proc.prosrc like '%kann_revier_
-- pflegen%'`, nicht durch Nachdenken über den Aufrufgraphen.

-- kartenobjekt_loeschen() (072/073/074) fragt hierüber, wer ein Objekt in den
-- Papierkorb legen darf. Ohne die Änderung könnte ein Bereichsschein-Inhaber
-- ein Objekt ausserhalb seines Bereichs löschen — nämlich jedes, das er selbst
-- angelegt hat, als sein Schein noch weiter reichte.
create or replace function public.kann_kartenobjekt_verwalten(p_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from map_objects o
     where o.id = p_id
       and ( (o.created_by = auth.uid()
              and (o.district_id is null
                   or darf_hier_pflegen(o.district_id, o.position)))
             or o.district_id in (select id from districts
                                   where owner_id = auth.uid()) )
  );
$$;

-- ⚠ Der search_path trägt jetzt zusätzlich `extensions` — st_covers kommt
-- über darf_hier_pflegen dazu. pg_temp bleibt am ENDE (076).

-- papierkorb_kartenobjekte() listet die gelöschten Objekte eines Reviers.
-- Der Zuteilungsfilter kommt je ZEILE dazu, nicht je Revier: bei
-- zuteilung = 'revier' ändert sich nichts, bei 'bereiche'/'staende' sieht der
-- Inhaber im Papierkorb genau das, was er auch auf der Karte sehen dürfte.
--
-- ⛔ VORBESTEHENDE LÜCKE, die 129 bewusst NICHT schliesst: die Funktion prüft
-- keinen `created_by`. Jeder, der das Revier pflegen darf, sieht hier auch die
-- gelöschten Objekte ANDERER — Name, Art und Beschreibung. Das gilt seit 072
-- und trifft den Vollschein genauso; es gehört zu 072/073/074 und braucht
-- einen eigenen Schnitt samt eigener Abwägung. 129 macht es nicht schlimmer
-- und an dieser Stelle auch nicht besser.
create or replace function public.papierkorb_kartenobjekte(p_district_id uuid)
  returns table(id uuid, name text, type map_object_type, description text,
                deleted_at timestamp with time zone, created_by uuid)
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select o.id, o.name, o.type, o.description, o.deleted_at, o.created_by
    from map_objects o
   where o.district_id = p_district_id
     and o.deleted_at is not null
     and kann_revier_pflegen(p_district_id)
     and ( o.district_id in (select id from districts where owner_id = auth.uid())
           or schein_deckt_objekt(o.district_id, o.id, o.position) )
   order by o.deleted_at desc;
$$;

commit;
