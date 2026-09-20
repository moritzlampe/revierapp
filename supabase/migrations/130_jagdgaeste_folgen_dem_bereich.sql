-- 130_jagdgaeste_folgen_dem_bereich.sql — CN-216
--
-- Gäste einer Jagd sehen die Kartenobjekte im BEREICH DES JAGDLEITERS, nicht
-- die des ganzen Reviers.
--
-- Entscheidung Moritz, 20.09.2026, auf die Frage "was sollen die Gäste auf
-- der Karte sehen?": "Nur die Stände seines Bereichs."
--
-- ============================================================================
-- WARUM — und warum der naheliegende Riegel FALSCH gewesen wäre
-- ============================================================================
-- 129 hat die Zuteilung eines Begehungsscheins wirksam gemacht: wer Bereich
-- Nord hat, sieht die Stände in Nord. Die Schlusslesung fand denselben Tag
-- die Hintertür (129, Falle 7b):
--
--   `map_objects_hunt_member` fragt nur nach dem REVIER einer Jagd, an der
--   man teilnimmt. Ein Bereichsschein-Inhaber legt also selbst eine Jagd auf
--   dem Revier an (092 erlaubt das jedem mit aktivem Schein, ohne die
--   Zuteilung zu prüfen), trägt sich als `joined` ein — und sieht wieder
--   ALLES. Die Beschränkung aus 129 ist damit abschaltbar, von dem, den sie
--   beschränkt.
--
-- ⚠ Der naheliegende Riegel ist der aus 121: `h.creator_id = d.owner_id`.
-- `zones_hunt_member` trägt ihn, `map_objects_hunt_member` nicht. Er wurde
-- Moritz vorgelegt und VERWORFEN, und der Grund ist praktisch:
--
--   Johann hat Bereich Nord und lädt zwei Freunde zu seiner Jagd ein. Mit
--   dem 121-Riegel sähen die Freunde GAR KEINE Stände — auch nicht die, auf
--   denen sie sitzen sollen. Der Riegel unterscheidet nicht zwischen
--   "Johann verschafft sich das ganze Revier" und "Johanns Gäste brauchen
--   die Stände in Johanns Bereich".
--
-- 130 zieht die Grenze stattdessen dort, wo ein Mensch sie erwartet: **die
-- Gäste erben die Zuteilung dessen, der sie eingeladen hat.**
--
-- ============================================================================
-- WAS DER BESTAND MERKT: NICHTS — und das ist gemessen
-- ============================================================================
-- Von 15 Jagden stammen 6 vom Revierbesitzer und 9 sind Einzeljagden ohne
-- Revier. **NULL Jagden wurden von jemand anderem als dem Revierbesitzer
-- angelegt** (gemessen 20.09.2026). Der neue Zweig feuert heute für keine
-- einzige Zeile; für alle 6 Revier-Jagden greift der Besitzer-Zweig, der
-- sich wie bisher verhält.
--
-- Real wird die Regel am Tag, an dem der erste fremde Bereichsschein
-- eingelöst wird. Heute gibt es vier Scheine: drei auf Söder, nie eingelöst
-- (kein Konto dahinter), und einen auf L7, seit dem 30.08.2026 abgelaufen.
--
-- ============================================================================
-- NEBENBEI BEHOBEN: der Typ der Ortsparameter
-- ============================================================================
-- 129 hat `schein_deckt_objekt` und `darf_hier_pflegen` mit `geography`
-- gebaut. `map_objects.position` ist aber `geometry` (gemessen) — es lief
-- über den impliziten Cast, also als geometry → geography → geometry bei
-- jedem Objekt. Die Regel aus 125 lautet "Typ der Nachbarspalte in derselben
-- Tabelle"; 130 zieht sie nach, weil es dieselben Funktionen ohnehin
-- anfasst. **Kein Verhalten ändert sich** (129 P3-P7 haben die Zahlen mit
-- dem Doppelcast belegt: 23/9/32/0/2), es fällt ein Cast je Zeile weg.

\set ON_ERROR_STOP on

begin;

-- ============================================================================
-- TEIL 1 — Der Kern bekommt einen Personen-Parameter
-- ============================================================================
-- Bisher fragte `schein_deckt_objekt` immer nach `auth.uid()`. Für 130 muss
-- dieselbe Frage über eine ANDERE Person gestellt werden: deckt der Schein
-- des JAGDLEITERS dieses Objekt?
--
-- ⛔ Die Vier-Argument-Fassung ist ein ORAKEL und bekommt deshalb KEIN
-- EXECUTE für irgendeine Client-Rolle. Wer sie rufen dürfte, könnte fragen
-- "hat Person X einen gültigen Schein, der Objekt O deckt?" — eine Auskunft
-- über fremde Scheine, die niemand per RLS lesen darf
-- (`hunting_licenses_holder` gibt nur die eigenen frei).
-- Sie wird ausschliesslich aus `jagd_deckt_objekt` gerufen, und die ist
-- SECURITY DEFINER, läuft also als Eigentümer.
--
-- Die Drei-Argument-Fassung bleibt als dünner Einstieg bestehen und behält
-- ihr EXECUTE für `authenticated` — `map_objects_jes_select` ruft sie bei
-- jedem Kartenaufruf. **Sie baut die Regel nicht nach, sie reicht durch**
-- (dieselbe Entscheidung wie bei `darf_hier_pflegen` in 129: zwei Fassungen
-- einer Rangfolge sind eine zu viel).

create or replace function public.schein_deckt_objekt(
  p_user        uuid,
  p_district_id uuid,
  p_object_id   uuid,
  p_position    geometry
) returns boolean
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from hunting_licenses hl
     where hl.holder_id = p_user
       and hl.status = 'aktiv'::jes_status
       -- ⚠ `current_date` ist der UTC-Tag. 092 rechnet mit dem BERLINER Tag
       -- (`(now() at time zone 'Europe/Berlin')::date`). Zwischen Mitternacht
       -- und 02:00 Berliner Zeit weichen beide ab: eine Jagd lässt sich dann
       -- schon anlegen, während die Gäste noch nichts sehen — und nach Ablauf
       -- bleibt die Sicht zwei Stunden zu lang.
       -- **Vorbestehend, nicht von 130 eingeführt:** 077 (`kann_revier_pflegen`,
       -- `get_my_jes_district_ids`) und 129 rechnen ebenfalls in UTC. 130
       -- bleibt bewusst bei `current_date`, weil ein Alleingang hier die
       -- Scheinfunktionen gegeneinander laufen liesse. Die Vereinheitlichung
       -- gehört über ALLE Scheinpfade auf einmal — Backlog CN-217.
       -- (Fremdprüfung Punkt 10, 20.09.2026.)
       and current_date between hl.valid_from and hl.valid_until
       and hl.district_id = p_district_id
       and (
             hl.zuteilung = 'revier'
          or (hl.zuteilung = 'staende'
              and p_object_id = any (hl.stand_ids))
          -- st_covers, nicht st_contains: ein Stand auf der gemeinsamen
          -- Kante zweier zugeteilter Bereiche gehört dazu (129).
          or (hl.zuteilung = 'bereiche'
              and exists (select 1 from zones z
                           where z.id = any (hl.zone_ids)
                             and z.district_id = p_district_id
                             and st_covers(z.polygon, p_position)))
         )
  );
$$;

comment on function public.schein_deckt_objekt(uuid, uuid, uuid, geometry) is
  'Deckt der Begehungsschein von p_user dieses Kartenobjekt? Die Kernfassung '
  'seit 130; die Drei-Argument-Schwester reicht auth.uid() durch. '
  '⛔ ORAKEL — KEIN EXECUTE für anon, authenticated oder service_role. Wer '
  'sie rufen dürfte, könnte fremde Scheine ausfragen, die per RLS niemand '
  'lesen darf. Einziger Aufrufer ist jagd_deckt_objekt (SECURITY DEFINER). '
  '⚠ Ein NULL als p_user trifft nichts, und zwar OHNE eigene Bedingung: '
  '"holder_id = NULL" ist unbekannt und liefert keine Zeile — gemessen an '
  'den drei uneingelösten Scheinen im Bestand (0 Treffer, obwohl 3 Zeilen '
  'holder_id IS NULL tragen). Der erste Entwurf trug hier ein '
  'zusätzliches "p_user is not null"; es war wirkungslos und damit genau '
  'die Bauform, vor der dieses Projekt überall warnt — ein Riegel, der '
  'formal nie zuschlägt, sieht aus wie ein Riegel.';

revoke execute on function public.schein_deckt_objekt(uuid, uuid, uuid, geometry)
  from public, anon, authenticated, service_role;

-- Die Drei-Argument-Fassung: gleiche Signatur wie in 129, nur `geometry`
-- statt `geography` — und der Rumpf reicht jetzt durch, statt die Regel ein
-- zweites Mal zu schreiben.
drop policy if exists map_objects_jes_select on public.map_objects;
drop function if exists public.schein_deckt_objekt(uuid, uuid, geography);

create or replace function public.schein_deckt_objekt(
  p_district_id uuid,
  p_object_id   uuid,
  p_position    geometry
) returns boolean
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select public.schein_deckt_objekt(auth.uid(), p_district_id,
                                    p_object_id, p_position);
$$;

comment on function public.schein_deckt_objekt(uuid, uuid, geometry) is
  'Deckt ein Begehungsschein DES AUFRUFERS dieses Kartenobjekt? Dünner '
  'Einstieg in die Vier-Argument-Fassung mit auth.uid(). '
  '⛔ SIE KENNT DEN REVIERBESITZER NICHT und gibt ihm für seine eigenen '
  'Objekte FALSE — er kommt über map_objects_owner_* und über die '
  'ausdrücklichen Besitzer-Zweige in darf_hier_pflegen, '
  'papierkorb_kartenobjekte und jagd_deckt_objekt. Deshalb heisst sie '
  '"schein_deckt_..." und nicht "darf_...".';

revoke execute on function public.schein_deckt_objekt(uuid, uuid, geometry)
  from public, anon;

create policy map_objects_jes_select on public.map_objects
  for select to authenticated
  using (
    district_id in (select get_my_jes_district_ids())
    and deleted_at is null
    and schein_deckt_objekt(district_id, id, position)
  );

-- `darf_hier_pflegen` zieht auf geometry nach. Sie ruft die
-- Drei-Argument-Fassung mit p_object_id = NULL; das NULL ist tragend und
-- gemessen (129): bei zuteilung = 'staende' gibt es keine Pflegefläche.
drop policy if exists map_objects_creator_select on public.map_objects;
drop policy if exists map_objects_creator_insert on public.map_objects;
drop policy if exists map_objects_creator_update on public.map_objects;
drop policy if exists map_objects_creator_delete on public.map_objects;
drop function if exists public.darf_hier_pflegen(uuid, geography);

create or replace function public.darf_hier_pflegen(
  p_district_id uuid,
  p_position    geometry
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
      or public.schein_deckt_objekt(p_district_id, null::uuid, p_position);
$$;

comment on function public.darf_hier_pflegen(uuid, geometry) is
  'Darf der Aufrufer an dieser Stelle des Reviers Kartenobjekte pflegen? '
  'Ortsbezogene Schwester von kann_revier_pflegen (077), seit 129 in den '
  'vier map_objects_creator_*-Policies. Der Revierbesitzer und ein '
  'Vollschein-Inhaber antworten wie vor 129 — der Bestand ist unberührt. '
  'Sie BAUT die Rangfolge nicht nach, sondern RUFT sie mit p_object_id = '
  'NULL; bei zuteilung = ''staende'' gibt es damit keine Pflegefläche, weil '
  '"null = any(stand_ids)" im exists() zu false wird (gemessen). Das ist '
  'eine Entscheidung, keine Lücke: wer eine Liste vorhandener Stände '
  'zugeteilt bekommt, pflegt die Karte nicht.';

revoke execute on function public.darf_hier_pflegen(uuid, geometry)
  from public, anon;

create policy map_objects_creator_select on public.map_objects
  for select to authenticated
  using (created_by = auth.uid()
         and (district_id is null or darf_hier_pflegen(district_id, position))
         and deleted_at is null);

create policy map_objects_creator_insert on public.map_objects
  for insert to authenticated
  with check (created_by = auth.uid()
              and (district_id is null
                   or darf_hier_pflegen(district_id, position))
              and deleted_at is null);

create policy map_objects_creator_update on public.map_objects
  for update to authenticated
  using (created_by = auth.uid()
         and (district_id is null or darf_hier_pflegen(district_id, position))
         and deleted_at is null)
  with check (created_by = auth.uid()
              and (district_id is null
                   or darf_hier_pflegen(district_id, position))
              and deleted_at is null);

create policy map_objects_creator_delete on public.map_objects
  for delete to authenticated
  using (created_by = auth.uid()
         and (district_id is null or darf_hier_pflegen(district_id, position))
         and deleted_at is null);

-- ============================================================================
-- TEIL 2 — Die Gäste erben die Zuteilung des Jagdleiters
-- ============================================================================
-- ⚠ Sie ist KEIN Orakel, obwohl sie die Vier-Argument-Fassung ruft: sie
-- fragt zuerst `get_my_joined_hunt_ids()`, also nach dem AUFRUFER. Man kann
-- nur über Objekte in Revieren fragen, an deren Jagden man selbst teilnimmt.

-- ⛔ SIE NIMMT NUR DIE OBJEKT-ID UND LIEST ORT UND REVIER SELBST.
-- Der erste Entwurf nahm `(district_id, object_id, position)` als Parameter —
-- wie ihre Schwestern — und war damit ein ORAKEL: ein Gast konnte
-- `jagd_deckt_objekt(revier, NULL, beliebiger_punkt)` rufen und die
-- BEREICHSGRENZEN DES JAGDLEITERS abtasten, Punkt für Punkt, auch dort wo gar
-- kein Stand steht. `joined` begrenzt die Reviere, nicht die Punkte
-- (Fremdprüfung Punkt 4, 20.09.2026).
-- Das wog schwerer als anderswo, weil ein Gast einer scheingeleiteten Jagd
-- die Zonen NICHT sehen darf: `zones_hunt_member` verlangt
-- `h.creator_id = d.owner_id` (121). Er hätte sich also genau das
-- zusammengesetzt, was ihm die Zonen-Policy vorenthält.
--
-- ⚠ Der Selbst-Lookup auf `map_objects` erzeugt KEINE Rekursion: die Funktion
-- ist SECURITY DEFINER und läuft als Eigentümer, für den RLS nicht gilt. Genau
-- deshalb bekommt sie die Objekt-ID und nicht die Zeile.
-- Der Preis ist ein Primärschlüssel-Zugriff je geprüfter Zeile.

create or replace function public.jagd_deckt_objekt(p_object_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from map_objects o
      join hunts h on h.district_id = o.district_id
      join districts d on d.id = h.district_id
     where o.id = p_object_id
       -- Auch hier, obwohl die Policy es schon prüft (Schlusslesung F5):
       -- `authenticated` behält EXECUTE, könnte die Funktion also per RPC für
       -- eine Papierkorb-Zeile rufen, deren id er noch kennt, und erführe
       -- "liegt weiter in einem Revier, in dem ich Mitglied bin".
       and o.deleted_at is null
       and h.id in (select get_my_joined_hunt_ids())
       and (
             -- ⛔ DER REVIERBESITZER WIRD NIE BESCHRÄNKT — auch nicht durch
             -- Bereiche, die er selbst per Begehungsschein vergeben hat.
             -- Moritz, 20.09.2026, wörtlich: "Johann sieht natürlich alle
             -- Stände im ganzen Revier inkl denen im Begehungsscheinrevier,
             -- nicht speziell auf der einen Jagd sondern wenn Johann eine
             -- Jagd anlegt hat er das ganze Revier zur Verfügung."
             -- Der Satz beantwortet zwei Fragen auf einmal: die Zuteilung
             -- beschränkt den EMPFÄNGER eines Scheins, nie den AUSSTELLER —
             -- und sie hängt nicht an der einzelnen Jagd.
             -- Heute trifft dieser Zweig ALLE sechs Revier-Jagden im Bestand.
             -- (Der Besitzer braucht ihn streng genommen nicht: er kommt
             -- ohnehin über map_objects_owner_select. Der Zweig steht hier,
             -- damit die Regel an der Stelle LESBAR ist, an der jemand sie
             -- sucht — und damit ein künftiger Umbau von owner_select sie
             -- nicht still mitnimmt.)
             h.creator_id = d.owner_id
             -- Der neue Fall: ein Scheininhaber leitet. Seine Gäste sehen,
             -- was SEIN Schein deckt.
          or public.schein_deckt_objekt(h.creator_id, o.district_id,
                                        o.id, o.position)
         )
  );
$$;

comment on function public.jagd_deckt_objekt(uuid) is
  'Darf der Aufrufer dieses Kartenobjekt sehen, weil er an einer Jagd in '
  'diesem Revier teilnimmt? Seit 130 erben Gäste die ZUTEILUNG DES '
  'JAGDLEITERS: lädt der Revierbesitzer ein, ist alles sichtbar wie bisher; '
  'lädt ein Begehungsscheininhaber ein, sehen seine Gäste das, was sein '
  'Schein deckt. '
  '⛔ GENAUER: die VEREINIGUNG über ALLE Jagden dieses Reviers, an denen der '
  'Betrachter je joined war — get_my_joined_hunt_ids() filtert weder den '
  'Jagdstatus noch die Zeit. Wer einmal Gast einer Jagd DES BESITZERS war, '
  'sieht in diesem Revier dauerhaft alles, auch wenn ihn später ein '
  'Bereichsschein-Inhaber einlädt. Gemessen 20.09.2026: alle 12 '
  'joined-Teilnahmen an Revier-Jagden hängen an beendeten Jagden, und kein '
  'Nutzer hat zwei verschiedene Leiter im selben Revier — heute folgenlos. '
  'Das ist KEINE Regression (vor 130 sah er ohnehin alles) und es ist die '
  'Rückblick-Semantik aus 128, aber wer die Beschränkung für lückenlos '
  'hält, irrt. (Schlusslesung F3.) '
  '⚠ Der Zuschnitt ist die Antwort auf die Frage, die der 121-Riegel falsch '
  'beantwortet hätte: "h.creator_id = d.owner_id" allein nähme den Gästen '
  'auch die Stände, auf denen sie sitzen sollen. '
  '⚠ Läuft der Schein des Leiters ab, verlieren seine Gäste die Sicht — '
  'gewollt: er selbst darf dann auch nicht mehr dort sein. Das ist die '
  'sichere Richtung, aber es ist ein stiller Verlust (S4), und der Client '
  'zeigt dann eine leere Karte statt einer Meldung.';

revoke execute on function public.jagd_deckt_objekt(uuid)
  from public, anon;

-- ⚠ `to authenticated`, und die Begründung ist NICHT "weil hier erstmals eine
-- Funktion gerufen wird" — das stand im ersten Entwurf und ist falsch
-- (Fremdprüfung Punkt 7). Gemessen: die alte Fassung rief bereits
-- `get_my_joined_hunt_ids()`, und `anon` hat darauf EXECUTE.
-- Der Grund ist der Rechteentzug auf der NEUEN Funktion: `jagd_deckt_objekt`
-- ist für `anon` gesperrt, und eine Policy, die für `anon` gilt und eine
-- Funktion ruft, auf die er kein EXECUTE hat, liefert ihm ein hartes 42501
-- statt einer leeren Liste (069). `to authenticated` nimmt ihn aus der
-- Policy heraus, bevor der Ausdruck ihn erreicht.
-- Messbar ändert sich für `anon` nichts: `get_my_joined_hunt_ids()` war für
-- ihn schon immer leer.
drop policy if exists map_objects_hunt_member on public.map_objects;

create policy map_objects_hunt_member on public.map_objects
  for select to authenticated
  using (deleted_at is null and jagd_deckt_objekt(id));

commit;
