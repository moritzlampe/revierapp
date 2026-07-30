-- 067: Jagdleiter ist Jagdleiter — die Vertretung darf die Jagd auch führen
--
-- ANLASS (Moritz, 30.07.2026): „mein Vater ist Jagdleiter, wird krank, ich
-- vertrete ihn. oder er hat keinen Empfang, oder sein Handy verloren -> ganzer
-- Jagdablauf gefährdet -> sicherheitsrelevantes Feature."
--
-- Gefunden beim Schreibpfad-Audit (docs/QuickHunt_Audit_Schreibpfade_PWA.md).
--
--
-- DAS PROBLEM WAR NICHT DAS FEHLENDE .select()
--
-- Die App kennt zwei verschiedene Begriffe von „darf":
--
--   isCreator     = hunts.creator_id = ich          — wer die Jagd ANGELEGT hat
--   isJagdleiter  = hunt_participants.role = ich    — wer sie FÜHRT
--
-- Das UI gattet an sieben Stellen auf `isJagdleiter`. Die RLS-Policies kannten
-- bis hierher ausschließlich `creator_id`. Solange beide dieselbe Person sind
-- — und das sind sie, weil hunt/create/page.tsx:526 dem Ersteller die Rolle
-- gleich mitgibt — fällt das niemandem auf. Genau in dem Moment, für den die
-- Rolle überhaupt existiert (Vertretung), klaffen sie auseinander:
--
--   „Hahn in Ruh"        hunts UPDATE                 → 0 Zeilen, kein Fehler
--   Teilnehmer entfernen hunt_participants DELETE     → 0 Zeilen, kein Fehler
--   Weitere einladen     hunt_participants INSERT     → 42501, lauter Fehler
--   Stand umbenennen     hunt_seat_assignments UPDATE → 0 Zeilen, kein Fehler
--   Zuweisung lösen      hunt_seat_assignments DELETE → 0 Zeilen, kein Fehler
--   Schütze zuweisen     hunt_seat_assignments INSERT → 42501, lauter Fehler
--
-- Die vier UPDATE/DELETE-Fälle scheitern STILL: RLS filtert die Zeile aus dem
-- USING heraus, PostgREST meldet Erfolg mit 0 betroffenen Zeilen. Der
-- Vertreter drückt „Hahn in Ruh", landet auf /app und die Jagd läuft weiter.
--
-- Deshalb ist das hier eine Policy-Migration und kein `.select()`-Nachtrag.
-- Ein `.select()` hätte den stillen Fehlschlag nur laut gemacht — die
-- Vertretung hätte trotzdem nicht funktioniert.
--
--
-- WARUM KEIN NEUER HELFER
--
-- `get_my_joined_hunt_ids_as_leader()` gibt es seit dem Chat-Freigabe-Umbau.
-- STABLE SECURITY DEFINER mit gesetztem search_path, liefert genau die
-- hunt_ids, in denen ich joined UND jagdleiter bin. `messages_insert_member`
-- benutzt sie bereits — der Chat war bisher die EINZIGE Tabelle, die den
-- Unterschied zwischen Ersteller und Jagdleiter kannte.
--
-- SECURITY DEFINER ist hier nicht Bequemlichkeit, sondern Notwendigkeit: die
-- Policy auf hunt_participants fragt hunt_participants ab. Ohne
-- RLS-Umgehung in der Funktion wäre das eine Endlosrekursion.
--
--
-- WARUM „VERLASSEN" EINE FUNKTION IST UND KEINE POLICY
--
-- Der zweite Fund desselben Audits: `hunt_participants` hat überhaupt keine
-- UPDATE-Policy für die eigene Zeile — nur SELECT. Das UI zeigt „Jagd
-- verlassen" per `canLeave = group && !isCreator` also exakt denen, denen RLS
-- das Schreiben verweigert. Der Knopf ist zu 100 % kaputt, seit es ihn gibt.
--
-- Die naheliegende Reparatur wäre eine Policy `USING (user_id = auth.uid())`.
-- Die wäre falsch: RLS kann nicht auf Spalten einschränken, also dürfte jeder
-- Teilnehmer damit auch sein eigenes `role` auf 'jagdleiter' setzen — und
-- durch Teil 1 dieser Migration ist das ab jetzt eine mächtige Rolle. Aus
-- einem Bugfix würde eine Rechteausweitung.
--
-- Eine Funktion, die genau zwei Spalten setzt, hat das Problem nicht.
--
--
-- WAS DIESE MIGRATION BEWUSST NICHT TUT
--
-- - Sie hindert einen Jagdleiter nicht daran, weitere Jagdleiter zu ernennen.
--   Das folgt aus „Jagdleiter ist Jagdleiter": wer vertreten darf, darf auch
--   eine Vertretung bestellen.
-- - Sie hindert ihn nicht daran, den Ersteller aus der Jagd zu entfernen.
--   Dessen Rechte hängen an hunts.creator_id, nicht an der Teilnehmerzeile —
--   er kommt über den Einladungslink zurück.
-- - Sie schränkt KEINE SPALTEN ein, denn RLS kann das nicht. Ein Jagdleiter
--   darf über die API ab jetzt jede Spalte von `hunts` schreiben — auch
--   `boundary`, `district_id`, `map_open` —, nicht nur `status`/`ended_at`.
--   Das UI bietet ihm davon nur „Hahn in Ruh" an; die Grenze ist also das
--   Frontend, nicht die Datenbank. Wer das enger will, braucht Spalten-GRANTs
--   (wirken rollenweit und träfen den Ersteller mit) oder einen zweiten
--   Trigger. Bewusst nicht gebaut: „Jagdleiter ist Jagdleiter" heißt, dass er
--   die Jagd führen darf, und der Ersteller kann kein bisschen weniger.
-- - Sie räumt die fehlenden .select()-Prüfungen im Client NICHT auf, und der
--   Client ruft `jagd_verlassen()` noch NICHT auf — bis dahin bleibt „Jagd
--   verlassen" kaputt. Das ist ein Client-Diff in app/app/hunt/[id]/page.tsx
--   und braucht eine eigene R1-Freigabe.
-- - Sie heilt eine zweite UI/RLS-Divergenz derselben Art nicht: page.tsx:263
--   setzt `isJagdleiter` allein über `role === 'jagdleiter'`, OHNE
--   `status === 'joined'`. Ein eingeladener, aber noch nicht beigetretener
--   Jagdleiter sieht die Führungs-UI, und `get_my_joined_hunt_ids_as_leader()`
--   verweigert ihm zu Recht alles. Gehört in denselben Client-Diff.
-- - Sie fasst die Kartenbearbeitung nicht an: MapContent bekommt bewusst
--   `isJagdleiter={isCreator}` (page.tsx:599, Kommentar bei 581). Dort gibt es
--   keine Lücke, weil UI-Gate und Policy dasselbe meinen.

begin;

-- ---------------------------------------------------------------------------
-- 1. hunts — der Jagdleiter darf die Jagd führen
-- ---------------------------------------------------------------------------

-- Stille Abhängigkeit, die man kennen muss: ein UPDATE mit WHERE-Klausel liest
-- die Zeile, also greift ZUSÄTZLICH die SELECT-Policy. Diese UPDATE-Policy
-- allein genügt nicht — sie funktioniert nur, weil `hunts_participant_select`
-- (`id IN (SELECT get_my_hunt_ids())`) jeden Teilnehmer lesen lässt. Wer die
-- SELECT-Policy je enger fasst, macht die Vertretung wieder still kaputt.

drop policy if exists hunts_leader_update on public.hunts;
create policy hunts_leader_update on public.hunts
  for update
  using      (id in (select public.get_my_joined_hunt_ids_as_leader()))
  with check (id in (select public.get_my_joined_hunt_ids_as_leader()));

-- Riegel dazu: creator_id bleibt fest.
--
-- Ohne ihn könnte ein Vertreter über dieselbe Policy `creator_id` auf sich
-- selbst setzen und den Ersteller dauerhaft aussperren. Kein Client schreibt
-- diese Spalte jemals nach dem INSERT, der Trigger kostet also nichts und
-- braucht keine Fallunterscheidung.

create or replace function public.hunts_creator_id_ist_fest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.creator_id is distinct from old.creator_id then
    raise exception 'creator_id einer Jagd ist unveränderlich';
  end if;
  return new;
end;
$$;

drop trigger if exists hunts_creator_id_fest on public.hunts;
create trigger hunts_creator_id_fest
  before update on public.hunts
  for each row execute function public.hunts_creator_id_ist_fest();

-- ---------------------------------------------------------------------------
-- 2. hunt_participants — einladen, entfernen, Rollen vergeben
-- ---------------------------------------------------------------------------

drop policy if exists participants_leader_all on public.hunt_participants;
create policy participants_leader_all on public.hunt_participants
  for all
  using      (hunt_id in (select public.get_my_joined_hunt_ids_as_leader()))
  with check (hunt_id in (select public.get_my_joined_hunt_ids_as_leader()));

-- ---------------------------------------------------------------------------
-- 3. hunt_seat_assignments — Stände zuweisen, umbenennen, lösen
-- ---------------------------------------------------------------------------

drop policy if exists seat_assignments_leader_all on public.hunt_seat_assignments;
create policy seat_assignments_leader_all on public.hunt_seat_assignments
  for all
  using      (hunt_id in (select public.get_my_joined_hunt_ids_as_leader()))
  with check (hunt_id in (select public.get_my_joined_hunt_ids_as_leader()));

-- ---------------------------------------------------------------------------
-- 4. chat_group_members — aus der Jagd-Chatgruppe entfernen
-- ---------------------------------------------------------------------------
--
-- „Teilnehmer entfernen" schreibt zweimal (page.tsx:432 und :440). Ohne diese
-- Policy wäre die Person aus der Jagd raus und läse im Jagd-Chat weiter mit —
-- ein halb ausgeführtes Entfernen ist schlechter als ein gescheitertes.
--
-- Eng gefasst auf Gruppen MIT hunt_id: die Policy gibt Macht über
-- Jagd-Chatgruppen, nicht über private Gruppen.

drop policy if exists chat_group_members_hunt_leader_delete on public.chat_group_members;
create policy chat_group_members_hunt_leader_delete on public.chat_group_members
  for delete
  using (group_id in (
    select g.id
    from public.chat_groups g
    where g.hunt_id in (select public.get_my_joined_hunt_ids_as_leader())
  ));

-- ---------------------------------------------------------------------------
-- 5. Jagd verlassen — die eigene Teilnehmerzeile, und nur zwei Spalten davon
-- ---------------------------------------------------------------------------

-- `pg_temp` gehört ans ENDE des search_path, nicht weggelassen: fehlt es in der
-- Liste, sucht Postgres das temporäre Schema IMPLIZIT ZUERST. Ein Angreifer legt
-- `pg_temp.hunt_participants` an, und diese SECURITY-DEFINER-Funktion schreibt
-- mit Eigentümerrechten in seine Tabelle statt in unsere.

create or replace function public.jagd_verlassen(p_hunt uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  betroffen int;
begin
  update hunt_participants
     set status  = 'left',
         left_at = now()
   where hunt_id = p_hunt
     and user_id = auth.uid()
     -- IS DISTINCT FROM, nicht <>: die Spalte ist nullable, und `null <> 'left'`
     -- ist null, nicht wahr. Eine Zeile ohne status wäre sonst nicht zu
     -- verlassen — und die Funktion würfe „keine offene Teilnahme".
     and status is distinct from 'left';

  get diagnostics betroffen = row_count;

  -- Ohne diese Zeile hätte die Funktion denselben Fehler wie der Code, den sie
  -- ersetzt: nichts getan, Erfolg gemeldet.
  if betroffen = 0 then
    raise exception 'Keine offene Teilnahme an dieser Jagd gefunden';
  end if;
end;
$$;

-- `anon` ausdrücklich mit-widerrufen: Supabase vergibt EXECUTE auf Funktionen im
-- public-Schema per DEFAULT PRIVILEGES an anon/authenticated/service_role. Ein
-- REVOKE FROM PUBLIC allein räumt ein direkt an anon vergebenes Recht nicht ab.
-- (Schaden wäre gering — für anon ist auth.uid() null, die Funktion fände 0
-- Zeilen und würfe. Aber ein nicht angemeldeter Aufrufer hat hier nichts zu
-- suchen, und der Einzeiler kostet nichts.)

revoke all     on function public.jagd_verlassen(uuid) from public, anon;
grant  execute on function public.jagd_verlassen(uuid) to authenticated;

commit;


-- ===========================================================================
-- NACHWEIS (nach dem Apply in EINEM Editor-Lauf markieren und ausführen)
-- ===========================================================================
--
-- Braucht eine Testjagd mit einem Jagdleiter, der NICHT der Ersteller ist.
-- Nie gegen die Pilotjagd a96c65d8-… laufen lassen.
--
-- Die IDs unten sind Platzhalter und müssen fest verdrahtet werden — nicht per
-- Sub-SELECT suchen (AGENTS.md, SQL-Regeln).
--
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claim.sub" = '<uuid des Vertreters>';
--
--   -- Positivkontrolle: der Vertreter sieht die Jagd
--   SELECT count(*) AS soll_1 FROM hunts WHERE id = '<hunt-uuid>';
--
--   -- Der eigentliche Nachweis: nebenwirkungsfreies UPDATE auf EINER Zeile.
--   -- Vor 067: 0 Zeilen. Nach 067: 1 Zeile.
--   UPDATE hunts SET status = status WHERE id = '<hunt-uuid>';
--
--   -- Riegel greift: muss mit „creator_id … unveränderlich" abbrechen
--   -- (getrennt laufen lassen, die Exception beendet die Transaktion)
--   -- UPDATE hunts SET creator_id = auth.uid() WHERE id = '<hunt-uuid>';
--
--   UPDATE hunt_seat_assignments SET seat_name = seat_name WHERE id = '<seat-uuid>';
-- ROLLBACK;
--
-- Für jagd_verlassen getrennt, weil eine Wirkung, die man erst herstellt, sich
-- nicht in derselben Anweisung prüfen lässt (AGENTS.md):
--
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claim.sub" = '<uuid eines Teilnehmers>';
--   SELECT jagd_verlassen('<hunt-uuid>');
--   SELECT status, left_at FROM hunt_participants
--    WHERE hunt_id = '<hunt-uuid>' AND user_id = '<uuid eines Teilnehmers>';
-- ROLLBACK;
