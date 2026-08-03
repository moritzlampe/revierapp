-- 089_treiben_auch_fuer_rollen_jagdleiter.sql
-- Nativer Track — 03.08.2026
--
-- MEHRERE JAGDLEITER JE JAGD, ADDITIV.
--
-- Moritz, 03.08.2026: "es sollte die Möglichkeit geben je Jagd einen
-- Jagdleiter hinzuzufügen: ich bin krank als Jagdleiter und übertrage es auf
-- jemand anderes (übertragen bedeutet ich behalte alle meine Rechte, jemand
-- anderes hat sie allerdings auch)."
--
-- Das Datenmodell trägt das bereits: `hunt_participants` erlaubt beliebig viele
-- Zeilen mit role='jagdleiter', und `get_my_joined_hunt_ids_as_leader()` gibt
-- sie alle zurück. Was fehlte, war die Gleichbehandlung in den Policies.
--
--
-- DER BESTAND WAR UNEINHEITLICH — GEMESSEN 03.08.2026
--
--   hunts (UPDATE)          hunts_leader_update           -> Rolle  ✓
--   hunt_participants       participants_leader_all       -> Rolle  ✓
--   hunt_seat_assignments   seat_assignments_leader_all   -> Rolle  ✓
--   hunt_drives             nur *_creator_*               -> Ersteller
--   hunt_drive_stands       nur *_creator_*               -> Ersteller
--
-- Drei von fünf Tabellen kannten den Jagdleiter per Rolle schon; die zwei
-- Treiben-Tabellen nicht. Solange isLeader im Client an `hunts.creator_id`
-- hing, fiel das nicht auf — Ersteller und Rolleninhaber waren immer dieselbe
-- Person.
--
-- Sobald der Client isLeader additiv auswertet (Ersteller ODER Rolle), wird
-- daraus ein S2-Fall aus dem Standard-Focus: **die Treiben-UI wäre sichtbar
-- und die Writes würden mit 42501 scheitern.** Ein Knopf, den genau der nicht
-- betätigen kann, dem er gezeigt wird.
--
--
-- ADDITIV, NICHT ERSETZEND
--
-- Die bestehenden `_creator_insert/_update/_delete`-Policies bleiben
-- unverändert stehen. Es kommt je Tabelle EINE Policy dazu. Postgres verknüpft
-- mehrere permissive Policies mit OR — der Ersteller verliert also nichts,
-- auch dann nicht, wenn er seine eigene Teilnehmerzeile nie auf 'joined' hat.
--
-- Das ist dieselbe Bauform, die Moritz für die Rolle selbst beschrieben hat:
-- hinzufügen, nicht übertragen. Und es ist die Bauform, die
-- `seat_assignments_leader_all` auf der Nachbartabelle schon vormacht — diese
-- Migration verallgemeinert einen vorhandenen Gedanken, sie erfindet keinen.
--
--
-- BEWUSST NICHT MITGENOMMEN: `hunts_delete_own`
--
-- Eine Jagd zu LÖSCHEN bleibt beim Ersteller. Zwei Gründe:
--   1. Es fehlt dadurch keine Funktion. Kein Client löscht Jagden — beide
--      beenden sie (endHunt, UPDATE auf status), und das deckt
--      `hunts_leader_update` bereits ab.
--   2. Löschen ist die einzige irreversible Handlung in diesem Bereich (S5),
--      und `hunts.id` hängt an Teilnehmern, Treiben, Ständen, Strecke und
--      Chat. Wer es später öffnen will, soll das bewusst tun.
--
--
-- BEKANNT UND NICHT HIER GESCHLOSSEN: DAS FK-ORAKEL IN hunt_drive_stands
--
-- Befund 8 des Codex-Reviews vom 03.08.2026. Das `with check` prüft nur
-- `drive_id`. Die übrigen Fremdschlüssel der Zeile — `map_object_id`,
-- `seat_assignment_id`, `participant_id` — müssen nicht zur selben Jagd oder
-- zum selben Revier gehören. Weil FK-Prüfungen RLS umgehen, kann ein
-- Jagdleiter darüber die EXISTENZ fremder UUIDs abfragen: Erfolg heißt "gibt
-- es", `23503` heißt "gibt es nicht".
--
-- Bewusst nicht in dieser Migration behoben, aus zwei Gründen:
--   1. Es ist VORBESTEHEND. `drive_stands_creator_insert` trägt dasselbe
--      `with check`, Zeichen für Zeichen. 089 weitet den Kreis der Betroffenen
--      von "Ersteller" auf "Ersteller plus benannte Jagdleiter" aus — das sind
--      Leute, denen der Revierbesitzer die Jagd anvertraut hat.
--   2. Der richtige Fix gehört auf BEIDE Policy-Familien gleichzeitig, sonst
--      entsteht ein Gefälle zwischen Ersteller und Vertreter — genau das, was
--      diese Migration abschafft. Das ist ein eigener Vorgang mit eigenen
--      Gegenproben, kein Nebenzug.
--
-- Der Ertrag des Orakels ist außerdem gering: es beantwortet "existiert diese
-- UUID", nicht "was steht drin". Wer die UUID schon hat, hat sie woanders her.
--
--
-- `to authenticated` IST PFLICHT, KEINE KOSMETIK
--
-- Beide Policies rufen eine Funktion auf. Policy-Ausdrücke laufen mit den
-- Rechten des Aufrufers: hat `anon` kein EXECUTE auf
-- get_my_joined_hunt_ids_as_leader(), wird aus einer leeren Liste ein hartes
-- 42501. Genau so ist es am 31.07.2026 auf `map_objects` passiert (s.
-- AGENTS.md). Die bestehenden Creator-Policies stehen zwar auf `{public}`,
-- aber deren Ausdruck ist eine Inline-Subquery ohne Funktionsaufruf — sie
-- liefern `anon` still 0 Zeilen. Die neuen dürfen das nicht erben.


-- ---------------------------------------------------------------------------
-- hunt_drives
-- ---------------------------------------------------------------------------

drop policy if exists hunt_drives_leader_all on public.hunt_drives;

create policy hunt_drives_leader_all
  on public.hunt_drives
  for all
  to authenticated
  using      (hunt_id in (select get_my_joined_hunt_ids_as_leader()))
  with check (hunt_id in (select get_my_joined_hunt_ids_as_leader()));


-- ---------------------------------------------------------------------------
-- hunt_drive_stands
--
-- Der Umweg über hunt_drives ist derselbe wie in den Creator-Policies: die
-- Tabelle trägt keine hunt_id, nur eine drive_id.
-- ---------------------------------------------------------------------------

drop policy if exists drive_stands_leader_all on public.hunt_drive_stands;

create policy drive_stands_leader_all
  on public.hunt_drive_stands
  for all
  to authenticated
  using (
    drive_id in (
      select d.id from hunt_drives d
       where d.hunt_id in (select get_my_joined_hunt_ids_as_leader())
    )
  )
  with check (
    drive_id in (
      select d.id from hunt_drives d
       where d.hunt_id in (select get_my_joined_hunt_ids_as_leader())
    )
  );


-- ---------------------------------------------------------------------------
-- GEGENPROBEN (alles in EINER Selektion, mit ROLLBACK)
--
-- Ziel-IDs fest verdrahten, nie per Sub-SELECT suchen. NICHT gegen die
-- Pilotjagd a96c65d8-… fahren — Wegwerf-Jagd im Testrevier L7 anlegen.
--
--   1. POSITIVKONTROLLE Ersteller: Moritz legt weiter ein Treiben an
--      (darf er über hunt_drives_creator_insert, unverändert).
--   2. Heinrich mit role='jagdleiter' + status='joined' auf der Wegwerf-Jagd:
--      INSERT auf hunt_drives muss durchgehen (vorher 42501/0 Zeilen).
--   3. Heinrich mit role='schuetze': INSERT muss weiterhin scheitern.
--      Das ist die Probe, die zeigt, dass die Policy die ROLLE liest und nicht
--      bloß jeden Teilnehmer durchlässt.
--   4. Heinrich mit role='jagdleiter', aber status='invited': muss scheitern —
--      get_my_joined_hunt_ids_as_leader() verlangt 'joined'.
--   5. anon: `begin; set local role anon;
--      select count(*) from hunt_drives; rollback;` muss eine ZAHL liefern,
--      keinen Fehler (die 42501-Probe aus AGENTS.md).
--   6. Nach dem Lauf: hunts_delete_own unverändert — Heinrich als
--      Rollen-Jagdleiter darf die Jagd NICHT löschen.
-- ---------------------------------------------------------------------------
