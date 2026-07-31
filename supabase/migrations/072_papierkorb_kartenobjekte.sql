-- 072 — Papierkorb für Kartenobjekte
--
-- ACHTUNG: DIESE MIGRATION IST IM ENTWURF FEHLERHAFT UND WIRD VON 073
-- KORRIGIERT. Sie ist appliziert (31.07.2026) und war folgenlos, weil keine
-- Zeile `deleted_at` gesetzt hatte. Zwei Fehler, beide in 073 beschrieben und
-- behoben: die Policy-Bauform verbot das Wegwerfen selbst, und
-- `kartenobjekt_wiederherstellen()` fragte eine zu weite Berechtigung ab.
-- Wer nur diese Datei liest, liest die Hälfte.
--
-- Anlass (Moritz, 30.07.2026): „Am Ende wird im Revier oft was geändert, wenn
-- man vor Ort ist." Also muss der Papierkorb dort sein, wo gelöscht wird — in
-- allen Clients.
--
-- WARUM 072 UND NICHT 070. Die 070 stand frei und war am 30.07. für genau
-- diesen Papierkorb reserviert; sie einzulösen sah nach Ordnung aus und war
-- falsch. Diese Migration ruft kann_revier_pflegen() auf, und die Funktion
-- entsteht erst in 071. Als 070 liefe sie beim Neuaufbau aus diesem Ordner vor
-- ihrer eigenen Abhängigkeit und bräche — gegen die Produktions-DB wäre das nie
-- aufgefallen, weil 071 dort längst appliziert ist. Die Nummer ist keine
-- Ablage, sie ist die Reihenfolge. 070 bleibt eine Lücke. (Codex, 31.07.2026)
--
-- WARUM ES MEHR IST ALS EIN RÜCKGÄNGIG-KNOPF. Am 31.07.2026 nachgemessen:
-- neun Tabellen zeigen auf map_objects. Ein hartes DELETE räumt heute vier
-- davon per CASCADE mit ab —
--   map_object_checks   die Kontrollhistorie des Standes
--   map_object_photos   seine Fotos
--   hunt_drive_stands, hunt_stand_bezug
-- und setzt in fünf weiteren still NULL, darunter kills.hochsitz_id: eine
-- vergangene Erlegung verliert ihren Stand, ohne dass jemand etwas merkt
-- (AGENTS.md: „SET NULL erzeugt stille Waisen"). Wer einen Hochsitz löscht,
-- weil er umgesetzt wurde, löscht heute seine ganze Vergangenheit mit.
-- Der Papierkorb hält die Zeile am Leben und damit all das.
--
-- DARAUS FOLGT: es gibt bewusst KEINEN Purge-Job. Ein Job, der nach 30 Tagen
-- wirklich löscht, wäre exakt die Kaskade oben — nur unbeaufsichtigt und ohne
-- dass jemand zusieht. Die Zeile bleibt liegen; sie ist unsichtbar, nicht weg.
--
-- Ebenfalls bewusst KEIN 30-Tage-Filter in der Papierkorb-Abfrage. Er wäre
-- eine Falle: das Objekt verschwände nach 30 Tagen auch aus dem Papierkorb und
-- wäre damit unsichtbar UND unwiederherstellbar, ohne je gelöscht worden zu
-- sein. Bei 238 Kartenobjekten insgesamt hat kein Revier einen Papierkorb, den
-- man filtern müsste. Kommt er, gehört der Filter in die Ansicht.

-- ---------------------------------------------------------------------------
-- 1. Die Spalte
-- ---------------------------------------------------------------------------
alter table map_objects add column if not exists deleted_at timestamptz;

comment on column map_objects.deleted_at is
  'Papierkorb (072): gesetzt = gelöscht. Alle RLS-Lesepfade blenden solche '
  'Zeilen aus, deshalb braucht kein Client einen Filter. Zurück nur über '
  'kartenobjekt_wiederherstellen(). Kein Purge-Job, siehe Migrationskopf.';

-- ---------------------------------------------------------------------------
-- 2. Die Policies — alle FÜNF, nicht nur die drei SELECT-Policies
-- ---------------------------------------------------------------------------
-- Der naheliegende Plan war „Filter in die SELECT-Policy". Das hätte nicht
-- gewirkt: RLS verodert die Policies eines Kommandos, und map_objects hat zwei
-- Policies mit `for all` — die gewähren SELECT ebenfalls. Ein gelöschtes Objekt
-- wäre für Ersteller und Revierbesitzer, also für genau die Leute mit der
-- Karte, sichtbar geblieben. Es müssen alle fünf sein.
--
-- `deleted_at is null` kommt nur ins USING, nicht ins WITH CHECK. USING sagt,
-- welche Zeilen man ANFASSEN darf; WITH CHECK, wie sie danach aussehen dürfen.
-- Stünde es auch im CHECK, wäre das Wegwerfen selbst blockiert.

-- Ersteller: WITH CHECK steht schon explizit da und bleibt, wie er ist.
drop policy if exists map_objects_creator_manage on map_objects;
create policy map_objects_creator_manage on map_objects
  for all
  using      (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id))
              and deleted_at is null)
  with check (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id)));

-- Revierbesitzer: hatte GAR KEINEN WITH CHECK. Bei `for all` heißt das nicht
-- „keine Prüfung", sondern „nimm das USING". Ohne den jetzt ausgeschriebenen
-- CHECK würde das USING mitsamt `deleted_at is null` auf die neue Zeile
-- angewandt — und der Besitzer könnte in seinem eigenen Revier nichts mehr in
-- den Papierkorb legen. Der CHECK ist also nicht Kosmetik, er hält den Zustand
-- von vorher.
drop policy if exists map_objects_district_owner on map_objects;
create policy map_objects_district_owner on map_objects
  for all
  using      (district_id in (select id from districts where owner_id = auth.uid())
              and deleted_at is null)
  with check (district_id in (select id from districts where owner_id = auth.uid()));

-- Die drei Lesepfade: kein WITH CHECK möglich, nur USING.
drop policy if exists map_objects_hunt_member on map_objects;
create policy map_objects_hunt_member on map_objects
  for select
  using (district_id in (select h.district_id from hunts h
                          where h.id in (select get_my_joined_hunt_ids())
                            and h.district_id is not null)
         and deleted_at is null);

drop policy if exists map_objects_jes_select on map_objects;
create policy map_objects_jes_select on map_objects
  for select
  using (district_id in (select get_my_jes_district_ids())
         and deleted_at is null);

drop policy if exists map_objects_own_no_district on map_objects;
create policy map_objects_own_no_district on map_objects
  for select
  using (district_id is null and created_by = auth.uid()
         and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 3. Der Papierkorb selbst
-- ---------------------------------------------------------------------------
-- Die Policies verstecken die Zeilen jetzt vor jedem — auch vor der Ansicht,
-- die sie zeigen soll. Deshalb liest der Papierkorb über security definer.
--
-- Eine zweite SELECT-Policy „zeige gelöschte an, wer pflegen darf" wäre der
-- kürzere Weg gewesen und wäre falsch: verodert mit den anderen hätte sie die
-- gelöschten Objekte wieder auf jede Karte gelassen. Genau die Doppeldeutigkeit
-- kann eine Policy nicht ausdrücken, eine Funktion schon.
--
-- Wer darf: kann_revier_pflegen() aus 071 — Besitzer oder aktiver
-- Scheininhaber. Die Frage wird weiter an EINER Stelle beantwortet; kommt die
-- Revier-Rolle, die 071 im Kopf beschreibt, erbt der Papierkorb sie mit.
create or replace function public.papierkorb_kartenobjekte(p_district_id uuid)
returns table (
  id          uuid,
  name        text,
  type        map_object_type,
  description text,
  deleted_at  timestamptz,
  created_by  uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.name, o.type, o.description, o.deleted_at, o.created_by
    from map_objects o
   where o.district_id = p_district_id
     and o.deleted_at is not null
     and kann_revier_pflegen(p_district_id)
   order by o.deleted_at desc;
$$;

-- Zurückholen. Muss ebenfalls security definer sein: die gelöschte Zeile ist
-- durch das USING oben unsichtbar, ein direktes UPDATE träfe 0 Zeilen.
--
-- Ein einziges Statement, und die Berechtigung steckt in seiner WHERE-Klausel.
-- Getrennt geprüft wäre es ein Zeitfenster zwischen Prüfung und Schreiben.
create or replace function public.kartenobjekt_wiederherstellen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update map_objects o
     set deleted_at = null
   where o.id = p_id
     and o.deleted_at is not null
     and case when o.district_id is null
              then o.created_by = auth.uid()
              else kann_revier_pflegen(o.district_id)
         end;

  -- Absichtlich EINE Meldung für drei Fälle (gibt es nicht / liegt gar nicht im
  -- Papierkorb / darf man nicht): eine genauere Auskunft verriete einem
  -- Fremden, ob eine id existiert.
  if not found then
    raise exception 'Objekt nicht im Papierkorb oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- `from public` allein schließt in Supabase nichts: EXECUTE geht per
-- ALTER DEFAULT PRIVILEGES direkt an anon und authenticated, an public vorbei.
-- Am 30.07.2026 unabhängig in beiden Tracks aufgeschlagen (067 und nativ).
revoke execute on function public.papierkorb_kartenobjekte(uuid)     from public, anon;
revoke execute on function public.kartenobjekt_wiederherstellen(uuid) from public, anon;
grant  execute on function public.papierkorb_kartenobjekte(uuid)      to authenticated;
grant  execute on function public.kartenobjekt_wiederherstellen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Was diese Migration NICHT tut
-- ---------------------------------------------------------------------------
-- Sie macht aus keinem Löschknopf einen Papierkorb-Knopf. Die vier `.delete()`
-- in revierapp (revier-content.tsx, revier/[id]/setup, zentrale/revierkarte,
-- MapObjectSheet) löschen weiter hart, und das funktioniert unverändert: eine
-- lebende Zeile hat deleted_at is null und kommt durch jedes USING. Die
-- Migration ist bis dahin inert. Nativ gibt es keinen Löschpfad, nur zwei
-- Lesestellen — die Karte blendet Gelöschtes ab sofort ohne eine Zeile
-- Client-Code aus.
--
-- OFFENE KANTE, bewusst nicht hier gelöst: ein Stand, der einer laufenden Jagd
-- zugewiesen ist. Heute setzt das harte DELETE hunt_seat_assignments.seat_id
-- auf NULL — hässlich, aber in sich stimmig. Nach der Umstellung auf
-- Papierkorb bleibt die Zuweisung auf eine id zeigen, die niemand mehr lesen
-- darf. Das gehört in den Client, der den Knopf zeigt (Rückfrage: „Der Stand
-- ist in Jagd X vergeben"), nicht in eine Policy.
