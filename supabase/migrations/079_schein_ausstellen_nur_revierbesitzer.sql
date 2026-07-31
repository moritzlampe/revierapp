-- 079 — einen Begehungsschein ausstellen darf nur der Revierbesitzer
--
-- Nachtrag zu 068. Die dortige Policy lautet:
--
--     hunting_licenses_issuer   FOR ALL   USING (issuer_id = auth.uid())
--
-- Sie prüft, dass ich mich selbst als Aussteller eintrage — und sonst nichts.
-- Vom Revier steht kein Wort darin. Nachgestellt am 31.07.2026 gegen die
-- Produktions-DB, als ein Nutzer, der Brockwinel weder besitzt noch dort einen
-- Schein hält (Transaktion mit Rollback):
--
--     insert into hunting_licenses (district_id, issuer_id, holder_id, …)
--     values (<Brockwinel>, <ich>, <ich>, …, 'aktiv');
--
--     INSERT             durchgegangen
--     districts          1
--     map_objects        3   <- die echten Pilotdaten
--     kann_revier_pflegen  true   <- Schreibrecht
--
-- Jeder angemeldete Nutzer konnte sich damit für JEDES Revier einen gültigen
-- Begehungsschein ausstellen und bekam Lese- UND Schreibzugriff. Ein
-- `POST /rest/v1/hunting_licenses` genügte; es brauchte keinen Trick.
--
-- Verwandt mit dem `pg_temp`-Fund aus 076: dort musste sich der Angreifer die
-- Schein-Zeile noch vortäuschen, hier durfte er sie einfach schreiben. Dieselbe
-- Wurzel — die Berechtigung hing an der Schein-Tabelle, ohne dass jemand
-- prüfte, wer Scheine für dieses Revier überhaupt vergeben darf.
--
-- DIE REGEL: ausstellen, ändern und löschen darf, wem das Revier gehört.
-- `districts.owner_id` ist die einzige Quelle dafür. Bewusst NICHT
-- `kann_revier_pflegen()` — das gilt seit 068 auch für Scheininhaber, und ein
-- Scheininhaber darf keine weiteren Scheine vergeben. Sonst reicht ein
-- einziger ausgestellter Schein aus, um das Revier beliebig weiterzureichen.
--
-- Bewusst als VIER Policies je Kommando statt einer `for all`. Grund steht in
-- AGENTS.md: eine `for all`-Policy prüft ihr USING auch gegen die NEUE Zeile,
-- ein eigener `with check` hebt das nicht auf. Getrennt ist jede Bedingung
-- genau dort, wo sie gelten soll, und beim Lesen sieht man es auch.
--
-- Die Bedingung steht absichtlich als Inline-Subquery und nicht als Funktion.
-- Heute (31.07.2026) hat uns genau das zweimal beschäftigt: eine Funktion im
-- Policy-Ausdruck macht aus „0 Zeilen" ein `42501`, sobald die aufrufende
-- Rolle kein EXECUTE hat (siehe 077 und 078). Eine Subquery hat das Problem
-- nicht. `to authenticated` steht trotzdem dran, weil `anon` die Bedingung
-- ohnehin nie erfüllt.
--
-- NICHT angefasst: `hunting_licenses_holder` (SELECT, `holder_id = auth.uid()`)
-- — der Inhaber muss seinen Schein weiter sehen, auch den gesperrten. Und der
-- Trigger `trg_hunting_licenses_holder_fixieren` bleibt, wie er ist: er
-- verbietet, `holder_id` nach dem Einlösen zu ändern. Der Besitzer kann einen
-- Schein also verlängern oder entziehen, aber nicht heimlich auf eine andere
-- Person umschreiben.
--
-- Der Bestand ist leer (`hunting_licenses`: 0 Zeilen), es kann also keine
-- Zeile geben, die durch die neue Schranke fällt.

-- Die alte Sammel-Policy weg, und die vier neuen ebenfalls vorsorglich: ohne
-- das zweite Bündel wäre die Migration beim zweiten Lauf mit `duplicate_object`
-- gescheitert, weil `drop … if exists` nur den ALTEN Namen kennt. Codex-Befund
-- vom 31.07.2026 — beim Trockenlauf gegen eine frische DB fällt so etwas nicht
-- auf, weil dort nichts existiert, was kollidieren könnte.
drop policy if exists hunting_licenses_issuer        on public.hunting_licenses;
drop policy if exists hunting_licenses_issuer_select on public.hunting_licenses;
drop policy if exists hunting_licenses_issuer_insert on public.hunting_licenses;
drop policy if exists hunting_licenses_issuer_update on public.hunting_licenses;
drop policy if exists hunting_licenses_issuer_delete on public.hunting_licenses;

-- ---------------------------------------------------------------------------
-- SELECT — Aussteller ODER Revierbesitzer
-- ---------------------------------------------------------------------------
-- Der Besitzer sieht bewusst auch Scheine, die er nicht selbst ausgestellt
-- hat. Ohne diesen Zweig wäre eine fremd eingeschleuste Zeile für ihn
-- unsichtbar und damit auch nicht wegzuräumen — genau der Fall, den die alte
-- Policy überhaupt erst möglich machte.
create policy hunting_licenses_issuer_select on public.hunting_licenses
  for select
  to authenticated
  using (
    issuer_id = auth.uid()
    or district_id in (select id from districts where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- INSERT — nur ins eigene Revier, nur im eigenen Namen
-- ---------------------------------------------------------------------------
-- Beide Bedingungen zusammen. `issuer_id = auth.uid()` allein war der Fehler
-- aus 068; `district_id`-Besitz allein erlaubte, einen Schein im Namen eines
-- anderen auszustellen.
create policy hunting_licenses_issuer_insert on public.hunting_licenses
  for insert
  to authenticated
  with check (
    issuer_id = auth.uid()
    and district_id in (select id from districts where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- UPDATE — verlängern, sperren, entziehen
-- ---------------------------------------------------------------------------
-- Das ist der Weg für „abgelaufenen Schein verlängern": `valid_until` hochsetzen.
-- Weil 077 das Datum bei jedem Zugriff prüft und nicht eine Status-Spalte, ist
-- das Revier in derselben Sekunde wieder offen — kein Job, kein Nachlauf.
--
-- USING und WITH CHECK tragen dieselbe Bedingung, aber aus zwei Gründen: USING
-- bestimmt, WELCHE Zeile ich anfassen darf, WITH CHECK, wie sie danach
-- aussehen darf. Ohne den WITH CHECK könnte ich einen Schein meines Reviers
-- nehmen und ihn per `district_id` auf ein fremdes Revier umhängen.
--
-- Nicht an `issuer_id` gebunden: wem das Revier gehört, der verwaltet alle
-- Scheine darin.
create policy hunting_licenses_issuer_update on public.hunting_licenses
  for update
  to authenticated
  using (
    district_id in (select id from districts where owner_id = auth.uid())
  )
  with check (
    district_id in (select id from districts where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- DELETE — zurücknehmen
-- ---------------------------------------------------------------------------
create policy hunting_licenses_issuer_delete on public.hunting_licenses
  for delete
  to authenticated
  using (
    district_id in (select id from districts where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Anwenden (jede Probe mit Rollback)
-- ---------------------------------------------------------------------------
--   Fremder stellt sich Schein fuer Brockwinel aus  -> 42501, KEINE Zeile
--   Besitzer stellt Schein fuer eigenes Revier aus  -> geht
--   Besitzer verlaengert valid_until                -> geht, Zugriff sofort da
--   Fremder haengt Schein auf fremdes Revier um     -> 0 Zeilen geaendert
--   Inhaber liest seinen eigenen Schein             -> unveraendert 1
