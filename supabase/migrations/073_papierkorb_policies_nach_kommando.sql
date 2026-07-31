-- 073 — Papierkorb, Teil 2: Policies nach Kommando, und wer wegwerfen darf
--
-- Korrigiert 072. Die Spalte `deleted_at` bleibt, die Policies werden ersetzt,
-- die Funktionen aus 072 werden nachgeschärft.
--
-- ---------------------------------------------------------------------------
-- Was an 072 falsch war — zwei Dinge, unabhängig voneinander
-- ---------------------------------------------------------------------------
--
-- ERSTENS, die Bauform. 072 schrieb `deleted_at is null` in das USING aller
-- fünf Policies, davon zwei mit `for all`. Der Gedanke: USING regelt, welche
-- Zeilen man anfassen darf, WITH CHECK, wie sie danach aussehen dürfen — also
-- blende ich im USING aus und lasse den CHECK in Ruhe.
--
-- Das stimmt nicht. Am 31.07.2026 am Testrevier „Karte (L7)" und an einer
-- Wegwerf-Tabelle nachgemessen, vier Varianten:
--
--   for all, deleted_at nur im USING, expliziter with check   → UPDATE 42501
--   for update, deleted_at nur im USING                       → UPDATE 42501
--   for update ohne deleted_at, verstecken per select-policy   → UPDATE 42501
--   nach Kommando getrennt, Wegwerfen über security definer    → alles grün
--
-- Zwei Regeln stecken darin, die zweite ist die allgemeinere:
--   1. Eine `for all`-Policy prüft ihr USING auch gegen die NEUE Zeile. Ein
--      eigener `with check` hebt das nicht auf, er kommt hinzu.
--   2. Eine normale Rolle kann eine Zeile nie in einen Zustand schreiben, den
--      die SELECT-Policies verbergen. Wer Gelöschtes per Policy versteckt, hat
--      damit auch verboten, etwas zu löschen.
-- Also gehört das Wegwerfen in eine `security definer`-Funktion — dieselbe
-- Bauform wie `jagd_verlassen()` aus 067: dort eine Spalten-, hier eine
-- Sichtbarkeitseinschränkung, beide kann RLS nicht ausdrücken.
--
-- ZWEITENS, die Berechtigung. `kartenobjekt_wiederherstellen()` aus 072 fragt
-- `kann_revier_pflegen(district_id)` — Besitzer ODER aktiver Scheininhaber.
-- Das ist WEITER als das, was heute gilt: ein Scheininhaber darf nur seine
-- EIGENEN Objekte verwalten (`created_by = auth.uid()` in der Ersteller-Policy),
-- fremde nur der Revierbesitzer. 072 hätte einem Scheininhaber also erlaubt,
-- jedes Objekt im Revier zurückzuholen. Folgenlos geblieben, weil bisher keine
-- Zeile `deleted_at` gesetzt hat und die Funktion damit nie etwas fand — aber
-- falsch, und hier repariert. (Codex-Review, 31.07.2026)
--
-- Beruhigend im Übrigen: 072 hat nichts kaputtgemacht. `deleted_at` ist überall
-- null, also war `deleted_at is null` überall wahr und jede Policy verhielt sich
-- wie vorher. Nach dem Apply gemessen: Moritz sah weiter 238 Objekte,
-- Heinrich 36.

-- ---------------------------------------------------------------------------
-- 1. Wer darf ein Kartenobjekt verwalten
-- ---------------------------------------------------------------------------
-- Dieselbe Bauform wie `kann_revier_pflegen()` aus 071 und aus demselben Grund:
-- die Frage wird an EINER Stelle beantwortet. Sie steht hier bewusst als
-- Funktion und nicht zweimal ausgeschrieben in den beiden Papierkorb-Funktionen
-- — sonst wandert die eine Kopie beim nächsten Mal und die andere nicht.
--
-- Der Ausdruck ist exakt die Vereinigung der beiden heutigen Schreibrechte:
-- Ersteller (mit Revierrecht, falls das Objekt an einem Revier hängt) ODER
-- Revierbesitzer. Nicht mehr.
--
-- security definer, weil sie auch über eine bereits versteckte Zeile Auskunft
-- geben muss — der Aufrufer kann sie ja gerade nicht mehr lesen.
create or replace function public.kann_kartenobjekt_verwalten(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from map_objects o
     where o.id = p_id
       and ( (o.created_by = auth.uid()
              and (o.district_id is null or kann_revier_pflegen(o.district_id)))
             or o.district_id in (select id from districts where owner_id = auth.uid()) )
  );
$$;

revoke execute on function public.kann_kartenobjekt_verwalten(uuid) from public, anon;
grant  execute on function public.kann_kartenobjekt_verwalten(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die beiden `for all`-Policies, nach Kommando aufgetrennt
-- ---------------------------------------------------------------------------
-- `deleted_at is null` steht in SELECT, UPDATE und DELETE — aus zwei
-- verschiedenen Gründen. Bei SELECT versteckt es. Bei UPDATE und DELETE
-- schützt es: eine weggeworfene Zeile soll auch blind über ihre id nicht mehr
-- angefasst werden können, sonst wäre der Papierkorb kein Papierkorb. Der Weg
-- zurück führt ausschließlich über kartenobjekt_wiederherstellen().
--
-- Beim INSERT steht es ebenfalls, und das ist kein Formalismus: ohne die
-- Bedingung könnte ein Client eine Zeile anlegen, die von Anfang an als
-- gelöscht markiert ist, und damit an der Funktion vorbei in den Papierkorb
-- schreiben. (Codex-Review, 31.07.2026)
--
-- Jedes `create policy` bekommt sein `drop policy if exists` — die Migration
-- muss ein zweites Mal laufen können, auch nach einem Abbruch in der Mitte.

drop policy if exists map_objects_creator_manage on map_objects;

drop policy if exists map_objects_creator_select on map_objects;
create policy map_objects_creator_select on map_objects
  for select
  using (created_by = auth.uid()
         and (district_id is null or kann_revier_pflegen(district_id))
         and deleted_at is null);

drop policy if exists map_objects_creator_insert on map_objects;
create policy map_objects_creator_insert on map_objects
  for insert
  with check (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id))
              and deleted_at is null);

drop policy if exists map_objects_creator_update on map_objects;
create policy map_objects_creator_update on map_objects
  for update
  using      (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id))
              and deleted_at is null)
  with check (created_by = auth.uid()
              and (district_id is null or kann_revier_pflegen(district_id))
              and deleted_at is null);

drop policy if exists map_objects_creator_delete on map_objects;
create policy map_objects_creator_delete on map_objects
  for delete
  using (created_by = auth.uid()
         and (district_id is null or kann_revier_pflegen(district_id))
         and deleted_at is null);

-- Der Revierbesitzer. In 072 hatte diese Policy als `for all` gar keinen
-- with check, was „nimm das USING" heißt; hier steht die Bedingung für INSERT
-- und UPDATE ausgeschrieben, damit sich nichts still verschiebt.
drop policy if exists map_objects_district_owner on map_objects;

drop policy if exists map_objects_owner_select on map_objects;
create policy map_objects_owner_select on map_objects
  for select
  using (district_id in (select id from districts where owner_id = auth.uid())
         and deleted_at is null);

drop policy if exists map_objects_owner_insert on map_objects;
create policy map_objects_owner_insert on map_objects
  for insert
  with check (district_id in (select id from districts where owner_id = auth.uid())
              and deleted_at is null);

drop policy if exists map_objects_owner_update on map_objects;
create policy map_objects_owner_update on map_objects
  for update
  using      (district_id in (select id from districts where owner_id = auth.uid())
              and deleted_at is null)
  with check (district_id in (select id from districts where owner_id = auth.uid())
              and deleted_at is null);

drop policy if exists map_objects_owner_delete on map_objects;
create policy map_objects_owner_delete on map_objects
  for delete
  using (district_id in (select id from districts where owner_id = auth.uid())
         and deleted_at is null);

-- Die drei reinen Lesepfade aus 072 (hunt_member, jes_select, own_no_district)
-- bleiben unverändert: sie sind `for select` und tragen `deleted_at is null`
-- schon richtig.

-- ---------------------------------------------------------------------------
-- 3. Wegwerfen und zurückholen — beide mit der engen Bedingung
-- ---------------------------------------------------------------------------
-- Beide Wechsel des Löschzustands laufen durch eine Funktion, keiner durch ein
-- UPDATE aus dem Client. Das ist nicht nur der Zwang aus Regel 2 oben, es ist
-- auch besser: eine RPC wirft bei fehlender Berechtigung einen Fehler, statt
-- wie ein RLS-gefiltertes UPDATE still 0 Zeilen zu melden. Genau dieser stille
-- Fehlschlag war der offene Audit-Punkt an MapObjectSheet.tsx.

create or replace function public.kartenobjekt_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update map_objects o
     set deleted_at = now()
   where o.id = p_id
     and o.deleted_at is null
     and kann_kartenobjekt_verwalten(p_id);

  -- Eine Meldung für alle Fälle: eine genauere Auskunft verriete einem Fremden,
  -- ob eine id existiert.
  if not found then
    raise exception 'Objekt nicht gefunden oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Ersetzt die Fassung aus 072, die `kann_revier_pflegen()` fragte und damit
-- einem Scheininhaber fremde Objekte zurückgeholt hätte.
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
     and kann_kartenobjekt_verwalten(p_id);

  if not found then
    raise exception 'Objekt nicht im Papierkorb oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function public.kartenobjekt_loeschen(uuid) from public, anon;
grant  execute on function public.kartenobjekt_loeschen(uuid) to authenticated;

-- `papierkorb_kartenobjekte()` aus 072 bleibt bei `kann_revier_pflegen()`, und
-- das ist Absicht: wer einen aktiven Schein hat, sieht über
-- `map_objects_jes_select` ohnehin JEDES lebende Objekt des Reviers. Ihm den
-- Papierkorb zu zeigen, verrät also nichts Neues. Zurückholen darf er trotzdem
-- nur seine eigenen — dieselbe Asymmetrie wie an der lebenden Tabelle, wo er
-- alles sieht und nur Eigenes ändert.

-- ---------------------------------------------------------------------------
-- Was diese Migration NICHT tut
-- ---------------------------------------------------------------------------
-- Die vier `.delete()` in revierapp löschen weiter hart, und das funktioniert
-- unverändert: eine lebende Zeile kommt durch jedes DELETE-USING. Erst wenn ein
-- Client auf kartenobjekt_loeschen() umgestellt ist, entsteht ein
-- Papierkorb-Eintrag.
--
-- Ein hartes DELETE bleibt absichtlich möglich. Es ist der Weg, etwas wirklich
-- loszuwerden — mitsamt der Kaskade, die 072 im Kopf beschreibt. Der Papierkorb
-- ist die neue Voreinstellung, kein Verbot.
