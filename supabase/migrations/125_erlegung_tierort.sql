-- 125 — Der Ort des STÜCKS bei einer Erlegung, getrennt vom Ort des Schützen
--
-- ANLASS (Moritz, 16.09.2026, am Gerät): „ich kann aber nach wie vor auf
-- longpress nur anblick melden. fände es sinnvoll auf longpress das die
-- ansicht genau dann ist wie bei einfach auf erlegung tippen wo man dann für
-- anblick auf das fernglas tippt -> ist konsistenter und bekannter".
-- Und zur Bedeutung des Punktes, auf Nachfrage: „da wo wir drücken ist die
-- erlegung dann erfasst."
--
-- Dieselbe Bauform wie 124, eine Tabelle weiter. Der geprüfte Bauplan liegt
-- in docs/konzepte/QuickHunt_Bauplan_Erlegung_Verorten_V1.md (quickhunt-native),
-- Prüfungen von Codex und der Schlusslesung in §14/§15 desselben Dokuments.
--
-- ⛔ WAS HEUTE IN `position` STEHT, IST NICHT EINHEITLICH — UND DAS IST DER
-- EIGENTLICHE ANLASS FÜR EINE ZWEITE SPALTE.
-- Der native Client schreibt dort den eingefrorenen GPS-Fix des MELDERS
-- (`src/lib/data/insertKill.ts:78`). **Die PWA nicht.** Sie hat zwei Einstiege
-- in denselben Picker, und beide schreiben in dieselbe Spalte:
--     ErlegungSheet.tsx:259   position={gpsPosition}          ← GPS-Fix
--     MapContent.tsx:2483     position={erlegungLongPressPos} ← Longpress
--       beide → WildartPicker.tsx:338-347 → insertKillBatch → kills.position
-- `kills.position` trägt damit SEIT JE zwei Bedeutungen, und für Altzeilen
-- ist das nicht mehr auflösbar: keine Spalte hält den Einstieg fest.
-- Gemessen am 16.09.2026, 3 Zeilen Bestand — praktisch folgenlos,
-- grundsätzlich nicht.
--   Wer die Vermischung für den Normalzustand hält, baut sie fort. Deshalb
--   steht sie hier oben und nicht in einer Fußnote.
--
-- WARUM DIE PWA NICHT MITGEZOGEN WIRD.
-- Sie ist im Maintenance-Modus; eine Änderung dort ist ein R1-Fall mit
-- eigenem Gerätetest und eigenem Anker 3. Das heilt zudem keine einzige
-- Altzeile. Der Preis steht im Spaltenkommentar, damit eine spätere
-- Auswertung `tier_position` nicht für „alle gesetzten Orte" hält.
--
-- ⚠ WARUM `geometry` UND NICHT `geography` WIE IN 124.
-- Die Regel aus 124 lautet nicht „nimm geography", sondern „nimm denselben
-- Typ wie die Nachbarspalte" — dort war die Nachbarin `location`
-- (geography), hier ist sie `position` (geometry(Point,4326), GIST-Index
-- `idx_kills_geo`). PostgREST liefert `geometry` als GeoJSON und `geography`
-- als EWKB-Hex; zwei Formate an EINER Tabelle wären die Falle vom 15.09.2026
-- (`ebc0542`, map_objects.position).
--   ⚠ Ein zweites Argument stand im Bauplan und ist von BEIDEN Prüfern
--   widerlegt worden: `revierapp/src/components/kill/KillDetailContent.tsx:50`
--   sei ein GeoJSON-only-Parser, der an `geography` zerbräche. Der Parser kann
--   tatsächlich kein Hex — er bekommt aber nur `kill.position` zu sehen (:162)
--   und die neue Spalte nie. **Die Typwahl ist eine Konsistenzentscheidung,
--   keine technische Notwendigkeit.** Wer das Gegenteil zitiert, zitiert eine
--   widerlegte Fassung.
--
-- WAS DIESE MIGRATION NICHT TUT.
-- Keine Policy, kein Fremdschlüssel, kein Trigger, kein REVOKE, kein Index.
-- Gemessen am 16.09.2026:
--   * Von den acht Triggern auf `kills` liest KEIN einziger die Position,
--     ausser dem Spiegel `sync_wild_event_for_kill` (AFTER), der sie nach
--     `wild_events.location` durchreicht. Das Herkunfts-Dreieck 087/090/092
--     ist nicht betroffen: `set_kill_herkunft` leitet `district_id` aus Jagd
--     oder Schein ab, `set_kill_drive_id` bestimmt das Treiben über die ZEIT.
--   * `kills` trägt nur Tabellen-ACLs, 0 Spalten-ACLs — die Spalte erbt.
--   * Kein Fremdschlüssel heisst: kein Existenz-Orakel wie bei 122, also auch
--     kein Invoker-Trigger.
-- Kein GIST-Index: es gibt keine räumliche Abfrage auf diese Spalte, und drei
-- Bestandszeilen rechtfertigen keinen. Nachrüsten ist additiv.
--
-- ⚠ DER SPIEGEL BLEIBT UNVERÄNDERT, UND DAS IST EINE ENTSCHEIDUNG.
-- `sync_wild_event_for_kill` nimmt diesen Punkt NICHT nach
-- `wild_events.tier_location` mit. Grund, gemessen: an einer Kill-Zeile hätte
-- er dort keinen Leser — der native Client zählt `wild_events` mit
-- `type='kill'` nur (`tagebuch.ts:70`, `count: exact, head: true`), und die
-- PWA kennt `tier_location` überhaupt nicht (0 Treffer). Ein Trigger, der eine
-- Spalte füllt, die niemand liest, ist kein Nutzen, sondern eine zweite
-- Wahrheit. Kommt je ein Leser, ist das Nachziehen additiv — es müsste dann
-- die Bestandszeilen mitnehmen.
--
-- ⚠ AKTIVE FALLE 1 — DIE PWA ZEIGT EINE SO VERORTETE ERLEGUNG AM SCHÜTZENORT.
-- `revierapp` liest ausschliesslich `position` (drei Mal implizit über
-- `select('*')`: useHuntStrecke.ts:39, useHuntKills.ts:29 — ohne Aufrufer —,
-- diary/detail-loaders.ts:46). Eine Erlegung mit gesetztem `tier_position`
-- erscheint dort also am Ort des Schützen, oder gar nicht, wenn keiner vorlag.
-- Bewusst hingenommen (Maintenance-Modus) — dieselbe Falle wie bei 124,
-- eine Tabelle weiter.
--
-- ⚠ AKTIVE FALLE 2 — AB HIER DARF EINE ERLEGUNG GANZ OHNE `position` UND MIT
-- `tier_position` ENTSTEHEN. Der Melder darf seit CN-177 Teil A (16.09.2026)
-- ohne jeden Ort melden; setzt er per Longpress einen Punkt, ist `position`
-- null und diese Spalte gefüllt.
-- **Jede Auswertung, die einen Ort braucht, muss BEIDE Spalten lesen** —
-- `coalesce(tier_position, position)` ist der Ort, `position` allein ist es
-- nicht mehr. Und beide dürfen zugleich null sein; kein CHECK verhindert das,
-- der Riegel gegen eine Meldung ohne jeden Ort ist bewusst abgeschafft
-- („Melden wird nie verhindert, nur ausgewiesen").
--
-- ⚠ AKTIVE FALLE 3 — DIE SPALTE IST NICHT EINGEFROREN, DER SPIEGEL GLEICHT
-- SIE ABER AUCH NICHT NACH. `kills_reporter` ist `FOR ALL` mit
-- `using (reporter_id = auth.uid())` und ohne `with check`; der Melder darf
-- seine Zeile also ändern. `set_kill_herkunft` friert `district_id`,
-- `hunting_license_id` und `erlegt_am` ein — diese Spalte nicht.
-- Wer `tier_position` nachträglich ändert, ändert an `wild_events` nichts,
-- und zwar ohne Fehlermeldung. Heute folgenlos: es gibt keinen Client-Weg
-- zum Nachtragen (Backlog CN-177).
--
-- ⚠ AKTIVE FALLE 4 — BEI EINER NACHSUCHE (`status = 'wounded'`) IST DIE
-- BEDEUTUNG DIESER SPALTE UNGEKLÄRT. „Dort lag das Stück" ist dann per
-- Definition falsch — es wurde nicht gefunden; gemeint wäre Anschuss oder
-- letzter Anblick. Gefunden von der Schlusslesung am 16.09.2026.
-- **Entscheidung Moritz, 16.09.2026: keine Sonderbehandlung, bis das
-- Nachsuchemodul kommt** — die Geste steht auch bei `wounded` zur Verfügung,
-- der Punkt wird geschrieben, und die Bedeutung klärt das Modul. Wer vorher
-- über `wounded`-Zeilen auswertet, wertet über eine offene Frage aus.

alter table public.kills
  add column if not exists tier_position geometry(Point, 4326);

comment on column public.kills.tier_position is
  'Der vom Melder auf der Karte GESETZTE Ort des Stuecks (Longpress) - '
  '"da wo wir druecken ist die erlegung dann erfasst" (Moritz, 16.09.2026). '
  'Unterschied zu `position`: das ist im NATIVEN Client der eingefrorene '
  'GPS-Fix des Schuetzen. '
  'ACHTUNG, und das ist die wichtigste Zeile hier: in der PWA gilt das NICHT. '
  'Dort schreibt auch der Karten-Longpress nach `position` '
  '(MapContent.tsx:2483 -> WildartPicker -> insertKillBatch), neben dem '
  'GPS-Weg aus ErlegungSheet.tsx:259. `position` traegt in PWA-Zeilen also '
  'zwei Bedeutungen, und keine Auswertung kann sie an der Zeile '
  'unterscheiden. `tier_position` ist NICHT "alle gesetzten Orte", sondern '
  'nur die des nativen Clients ab Build 21. '
  'Beide Spalten koennen null sein, auch BEIDE ZUGLEICH: seit CN-177 Teil A '
  '(16.09.2026) darf ohne jeden Ort gemeldet werden, und kein CHECK '
  'verhindert es. Verlasse dich also NICHT darauf, dass '
  'coalesce(tier_position, position) etwas liefert - aber wenn du einen Ort '
  'brauchst, nimm genau diesen Ausdruck und nie `position` allein. '
  'Der Kill-Spiegel `sync_wild_event_for_kill` nimmt diese Spalte NICHT nach '
  '`wild_events.tier_location` mit (kein Leser dort); die PWA zeigt eine so '
  'verortete Erlegung deshalb am Schuetzenort oder gar nicht. '
  'Bei status=''wounded'' ist die Bedeutung offen - "dort lag das Stueck" ist '
  'bei einer Nachsuche falsch. Bewusst nicht geregelt bis zum Nachsuchemodul '
  '(Moritz, 16.09.2026). '
  'Genauigkeit: ein gesetzter Punkt liegt bei Kartenzoom 16 auf etwa 16 m '
  'genau, ein GPS-Fix auf 5 m Median - das ist trotzdem der bessere Wert zur '
  'Frage "wo ist das Stueck", weil der Schuetzen-Fix sie um die ganze '
  'Distanz zwischen Schuetze und Stueck verfehlt.';
