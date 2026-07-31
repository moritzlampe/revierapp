-- 078 — die vier Creator-Policies auf map_objects gelten nur für Angemeldete
--
-- Nachtrag zu 071 und zu 077. Kein neues Verhalten für irgendeinen Nutzer,
-- sondern die Behebung eines Fehlers, der seit 071 ausgeliefert ist:
--
--     begin; set local role anon; select count(*) from map_objects; rollback;
--     ERROR: 42501 permission denied for function kann_revier_pflegen
--
-- Gemessen am 31.07.2026 gegen die Produktions-DB. Erwartet wäre „0 Zeilen",
-- geliefert wird ein Serverfehler.
--
-- URSACHE: Policy-Ausdrücke laufen mit den Rechten des AUFRUFERS, nicht denen
-- des Tabelleneigentümers. Alle vier `map_objects_creator_*`-Policies rufen
-- `kann_revier_pflegen()`, und `anon` hat darauf kein EXECUTE
-- (`has_function_privilege('anon', …)` = false). Postgres wertet den Ausdruck
-- aus, bevor die vorangestellte Bedingung `created_by = auth.uid()` etwas
-- ausschließen könnte — auf `AND`-Kurzschluss ist kein Verlass, die
-- Auswertungsreihenfolge ist nicht zugesichert. Also bricht die ganze Abfrage
-- ab, statt still nichts zu liefern.
--
-- Warum es nie auffiel: bisher liest kein Gast-Pfad Kartenobjekte. Bei
-- `districts` wäre es sofort aufgefallen — das liest der Gast-/Akquise-Layer
-- der PWA, und dort hat 077 denselben Fehler gerade noch vermieden.
--
-- DIE BEHEBUNG ist `to authenticated` und sonst nichts. Jeder USING- und
-- WITH-CHECK-Ausdruck bleibt zeichengleich; nachgeprüft über pg_policy vor dem
-- Schreiben dieser Datei.
--
-- Warum nicht stattdessen `grant execute … to anon`? Das würde denselben
-- Fehler beheben, aber `kann_revier_pflegen()` zugleich als offenen
-- PostgREST-Endpunkt für Unangemeldete führen. Er gäbe zwar immer `false`
-- zurück (ohne `auth.uid()` ist kein Zweig wahr), aber die schmalere Änderung
-- ist die, die gar nichts öffnet. Dieselbe Linie wie 069 und 075.
--
-- Enger, nicht weiter: alle vier Policies verlangen `created_by = auth.uid()`.
-- Für `anon` ist das NULL und damit nie wahr — die Policies haben einem Gast
-- noch nie eine Zeile gegeben. Es ändert sich nur, dass sie ihn nicht mehr
-- anschreien.
--
-- Rückwärtskompatibel: für `authenticated` ändert sich nichts. Beide Clients
-- arbeiten angemeldet.
--
-- Verliert eine ANDERE Rolle etwas? Ein Codex-Review hat die Frage gestellt und
-- ausdrücklich als „aus dieser Datei nicht entscheidbar" markiert. Nachgemessen
-- am 31.07.2026 — auf `map_objects` haben genau vier Rollen Tabellenrechte:
--
--     anon           kein rolbypassrls  -> bekam über diese Policies nie eine
--                                          Zeile (`created_by = auth.uid()`
--                                          ist für ihn NULL)
--     authenticated  kein rolbypassrls  -> ausdrücklich genannt, unverändert
--     postgres       rolbypassrls       -> RLS greift gar nicht
--     service_role   rolbypassrls       -> RLS greift gar nicht
--
-- Es bleibt also keine Rolle übrig, der `to authenticated` etwas wegnimmt.

-- ---------------------------------------------------------------------------
-- SELECT — der einzige der vier, an dem der Fehler heute wirklich hängt
-- ---------------------------------------------------------------------------
drop policy if exists map_objects_creator_select on public.map_objects;

create policy map_objects_creator_select on public.map_objects
  for select
  to authenticated
  using (
    created_by = auth.uid()
    and (district_id is null or kann_revier_pflegen(district_id))
    and deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- INSERT / UPDATE / DELETE — dieselbe Behandlung, aus Gleichförmigkeit
-- ---------------------------------------------------------------------------
-- Ein Gast schreibt ohnehin nicht; hier ginge der 42501 nur bei einem
-- Schreibversuch los, der so oder so scheitern muss. Trotzdem mitgenommen:
-- vier Policies mit derselben Bedingung, von denen drei anders aussehen als
-- die vierte, sind die Vorlage für den nächsten Irrtum.
drop policy if exists map_objects_creator_insert on public.map_objects;

create policy map_objects_creator_insert on public.map_objects
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (district_id is null or kann_revier_pflegen(district_id))
    and deleted_at is null
  );

drop policy if exists map_objects_creator_update on public.map_objects;

create policy map_objects_creator_update on public.map_objects
  for update
  to authenticated
  using (
    created_by = auth.uid()
    and (district_id is null or kann_revier_pflegen(district_id))
    and deleted_at is null
  )
  with check (
    created_by = auth.uid()
    and (district_id is null or kann_revier_pflegen(district_id))
    and deleted_at is null
  );

drop policy if exists map_objects_creator_delete on public.map_objects;

create policy map_objects_creator_delete on public.map_objects
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    and (district_id is null or kann_revier_pflegen(district_id))
    and deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Anwenden
-- ---------------------------------------------------------------------------
--   als anon    -> select count(*) from map_objects liefert eine ZAHL (0),
--                  keinen Fehler
--   Besitzer    -> unverändert; Papierkorb löschen/auflisten/wiederherstellen
--                  läuft durch (Positivkontrolle)
--   Scheininhaber mit gültigem Schein -> sieht seine Objekte wie zuvor
