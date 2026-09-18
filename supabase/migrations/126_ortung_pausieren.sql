-- ===========================================================================
-- 126 — Für heute abmelden: die Ortung pausieren, ohne die Jagd zu verlassen
-- ===========================================================================
--
-- Nativer Track, CN-195. Bauplan und Prüfergebnisse:
-- quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Ortung_Abmelden_V1.md
--
-- WOZU
-- ----
-- Wer heimfährt, während die Jagd noch läuft, sendet heute weiter seinen
-- Standort und zeichnet weiter seinen Pirschweg auf. Gemessen an der Jagd
-- „Ermland-Masuren 2026" (13.–17.09.2026): ein Teilnehmer schrieb 6.631
-- Positionen, ALLE mehr als 50 km vom Jagdgebiet entfernt, die weiteste
-- 687 km — vier Tage Alltag in Deutschland, an eine Jagd in Polen gehängt,
-- für die drei Gäste vor Ort sichtbar.
--
-- Er soll das ab einem Zeitpunkt abstellen können, OHNE die Jagd zu
-- verlassen: Chat, Strecke, Teilnahme und der bisher aufgezeichnete Weg
-- bleiben. `jagd_verlassen()` (067) nimmt all das mit und ist deshalb die
-- falsche Antwort; `position_consent = 'none'` (057) löscht den kompletten
-- Weg und ist es ebenso.
--
-- WARUM EINE RPC UND KEINE POLICY
-- -------------------------------
-- `hunt_participants` trägt vier Policies, und KEINE erlaubt einem
-- Teilnehmer, seine eigene Zeile zu ändern: `participants_own_row` und
-- `participants_hunt_member` sind reine SELECTs, `participants_creator_all`
-- und `participants_leader_all` gehören Ersteller und Jagdleiter.
-- Eine Self-UPDATE-Policy wäre die falsche Abhilfe — RLS kann eine Policy
-- nicht auf einzelne Spalten beschränken, und ein Spalten-GRANT wirkt
-- rollenweit. Also derselbe Weg wie bei `jagd_verlassen()` und
-- `set_position_consent()`: eine SECURITY-DEFINER-Funktion, die genau eine
-- Spalte an genau der eigenen Zeile setzt.
--
-- VORLAGE IST 067, NICHT 057
-- --------------------------
-- Gemessen am 18.09.2026: `set_position_consent` (057/059) ist trotz ihres
-- REVOKE bis heute für `anon` ausführbar — sie trägt den Fehler, den
-- AGENTS.md beschreibt („REVOKE … FROM PUBLIC entzieht bei Supabase gar
-- nichts"). `jagd_verlassen` hat `anon = false` und den 0-Zeilen-Riegel.
-- Diese Migration folgt 067. (Der Fehler in 057 ist als eigener
-- Backlog-Punkt CN-199 festgehalten, er gehört nicht hierher.)
--
-- WAS DIESE MIGRATION BEWUSST NICHT TUT
-- -------------------------------------
-- 1. KEINE Policy-Änderung an `positions_current`. Naheliegend wäre, das
--    Schreiben serverseitig zu sperren. `positions_current_upsert_own` ist
--    aber `for all` mit leerem `with check` — eine Verschärfung des USING
--    sperrte damit auch das DELETE, und der Abgemeldete käme an seine eigene
--    Zeile nicht mehr heran. Ob ein eigenes, strengeres `with check` das
--    löst, ist offen: AGENTS.md hält fest, dass bei `for all` das USING auch
--    gegen die neue Zeile geprüft wird und ein eigenes `with check` das
--    nicht aufhebt (gemessen 31.07.2026) — die Fremdprüfung dieses Bauplans
--    sagt das Gegenteil. Das ist ein SCHREIBTEST an einer temporären Tabelle
--    mit Rollback, und er gehört vor die Policy, nicht in diese Migration.
--    ⚠ FOLGE, DIE MAN WISSEN MUSS: der Riegel liegt damit ausschliesslich im
--    nativen Client ab Build 25. **Die PWA und jeder Build ≤ 24 kennen die
--    Spalte nicht und schreiben weiter** — wer dort eingeloggt ist, setzt den
--    Punkt eines Abgemeldeten wieder auf die Karte, und niemand räumt ihn.
--    Ein ZWEITGERÄT ab Build 25 stoppt dagegen: `stopIfHuntEndedOrGone` liest
--    die Spalte seit CN-195 in derselben Abfrage mit, in der es ohnehin den
--    Jagdstatus holt.
--    ⚠ **Es stoppt aber NICHT sofort, und zwar in zwei Stufen** (Schlusslesung
--    18.09.2026, F6): der Flush braucht einen FIX — ein stillliegendes Gerät
--    merkt gar nichts, bis sich jemand bewegt —, und bei diesem Fix läuft der
--    Live-Upsert VOR der Statusprüfung. **Das Zweitgerät legt die eben
--    gelöschte Zeile also noch einmal an**, an seiner aktuellen Position, und
--    schreibt einen letzten Batch, bevor es aufhört. Niemand löscht diese
--    Zeile danach.
--    **Sichtbar wird diese Zeile nicht**, solange der Client die Pause kennt:
--    Kartenmarker, Posten-Overlay und Jägerliste verbergen jeden Pausierten,
--    unabhängig vom Zeitstempel seiner Zeile.
--    ⚠ **Zwei frühere Fassungen dieser Stelle waren falsch, und beide Male
--    aus demselben Grund** — sie versuchten, den einmaligen Nachzügler eines
--    Zweitgeräts von einer echten Wiederanmeldung zu TRENNEN (zuletzt über
--    eine Zwei-Minuten-Grenze). **Das kann der Client nicht:** beide sind ein
--    Upsert nach der Pause, ein stillliegendes Gerät liefert seinen
--    Nachzügler auch zehn Minuten später, und ein Wiederangemeldeter, der
--    sich nicht bewegt, sendet gar nichts Neues. Die Heuristik lag in beide
--    Richtungen falsch und ist entfernt (Fremdprüfung Delta 3, Punkte 5 und
--    O2).
--    **Der Preis, benannt:** wer sich wieder anmeldet, erscheint auf einer
--    bereits geöffneten Karte erst, wenn sie ihre Teilnehmer neu lädt.
--    **Und die PWA sowie Build ≤ 24 bleiben offen:** sie kennen die Spalte
--    nicht, schreiben weiter und machen einen Abgemeldeten dort wieder
--    sichtbar, wo ihr eigener Client ihn zeigt. Das schliesst nur der Riegel
--    aus Punkt 1.
-- 2. KEIN Trigger, der die Spalte gegen fremde Schreiber festhält. Ein
--    Jagdleiter kann sie über `participants_leader_all` ändern — aber
--    `position_consent` ist heute genauso ungeschützt, und ein Riegel für
--    eine der beiden Spalten allein wäre einer, der nur so aussieht.
--    Beide zusammen, Muster 085 (`kontakt_feste_spalten`): CN-198.
--    (Entscheidung Moritz, 18.09.2026: „ok jetzt keine und backlog".)
-- 3. KEINE Regel für den Obertreiber. 059 verbietet ihm `none`/`anon`, weil
--    seine Sichtbarkeit eine Zusage an die ganze Jagdgesellschaft ist — eine
--    Pause hat dieselbe Wirkung und umgeht den Riegel. Heute folgenlos:
--    0 Obertreiber im Bestand, das Treiber-Modul existiert nicht. Wer es
--    baut, entscheidet diese Frage mit; der Hinweis steht deshalb auch im
--    `comment on column`. (Entscheidung Moritz, 18.09.2026.)
--
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Die Spalte
-- ---------------------------------------------------------------------------
--
-- Nullable ohne Default: `null` heisst „sendet", ein Zeitstempel heisst
-- „pausiert seit". Der Wert trägt die Anzeige gleich mit — die Jägerliste
-- schreibt „abgemeldet · 17:42" daraus, ohne ein zweites Feld.
--
-- `timestamptz`, nicht `boolean`: ein Ja/Nein sagte nicht, seit wann, und
-- genau danach fragt der Jagdleiter, wenn ihm jemand auf der Karte fehlt.

alter table public.hunt_participants
  add column if not exists ortung_pausiert_seit timestamptz;

comment on column public.hunt_participants.ortung_pausiert_seit is
  'CN-195: Zeitpunkt, ab dem dieser Teilnehmer seinen Standort nicht mehr '
  'teilt und keinen Pirschweg mehr aufzeichnet. NULL = sendet. Die Teilnahme '
  'bleibt unberuehrt (Chat, Strecke, bisheriger Weg) — das ist der '
  'Unterschied zu jagd_verlassen() aus 067 und zu position_consent=none aus '
  '057, das den kompletten Weg loescht. '
  'ACHTUNG beim Treiber-Modul: 059 verbietet einem Obertreiber none/anon, '
  'weil seine Sichtbarkeit eine Zusage an die Jagdgesellschaft ist. Eine '
  'Pause hat dieselbe Wirkung und umgeht diesen Riegel bewusst (Moritz, '
  '18.09.2026) — heute folgenlos, weil es keine Obertreiber gibt.';

-- ---------------------------------------------------------------------------
-- 2. Die RPC
-- ---------------------------------------------------------------------------
--
-- `pg_temp` gehört ans ENDE des search_path, nicht weggelassen: fehlt es in
-- der Liste, sucht Postgres das temporäre Schema IMPLIZIT ZUERST, und
-- `authenticated` darf temporäre Tabellen anlegen (076, am 31.07.2026
-- nachgestellt).

create or replace function public.ortung_pausieren(
  p_hunt_id   uuid,
  p_pausiert  boolean,
  -- Der Zeitpunkt, zu dem der Mensch gedrückt hat, nach der Uhr SEINES Geräts.
  -- Gebraucht, weil der Knopf ohne Netz wirkt: wer um 17:42 am Waldrand
  -- abmeldet und um 18:10 wieder Empfang hat, soll „abgemeldet · 17:42" lesen
  -- und nicht 18:10 (Fremdprüfung 18.09.2026, Paket B, O1).
  p_gesetzt_am timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  betroffen int;
  ergebnis  timestamptz;
begin
  -- NULL-Argumente ausdrücklich abweisen. Ohne diese Zeile läse
  -- `p_pausiert = null` sich im `case` unten als „nicht pausiert" und ein
  -- verirrter Aufruf hübe die Pause auf — eine Wiederanmeldung, die niemand
  -- bestellt hat. (Fremdprüfung 18.09.2026, Punkt 13.)
  if p_hunt_id is null or p_pausiert is null then
    raise exception 'ortung_pausieren: beide Argumente sind Pflicht';
  end if;

  update hunt_participants
     -- Drei Stufen, jede mit eigenem Grund:
     --
     -- 1. `coalesce(ortung_pausiert_seit, …)` macht das Pausieren IDEMPOTENT:
     --    ein zweiter Aufruf — ein nachgeholter Wunsch, ein Zweitgerät — darf
     --    die angezeigte Uhrzeit nicht verschieben.
     -- 2. `p_gesetzt_am` ist der Zeitpunkt des DRÜCKENS. Ohne ihn stünde bei
     --    einer nachgeholten Abmeldung die Zeit der Zustellung, und aus
     --    „17:42 am Waldrand" würde „18:10 auf der Autobahn".
     -- 3. ⛔ `least(…, now())` ist der Riegel dagegen, dass eine falsch
     --    gestellte Geräteuhr eine Pause in die ZUKUNFT legt. Dieselbe Falle
     --    wie bei 091 und 119: ein Zukunftsdatum ist in jeder Sortierung und
     --    jeder Anzeige dauerhaft Sieger, und niemand sieht mehr, seit wann
     --    wirklich pausiert wird. Rückdatierung bleibt erlaubt — sie ist bei
     --    einem nachgeholten Wunsch genau der Zweck.
     set ortung_pausiert_seit = case
           when p_pausiert
             then coalesce(
                    ortung_pausiert_seit,
                    -- ⛔ `greatest(…)` ist der Riegel gegen `-infinity`
                    -- (Schlusslesung 18.09.2026, F10). PostgREST liefert den
                    -- Wert als `"-infinity"`, `new Date()` macht daraus NaN,
                    -- und jeder Client läse „sendet", während der Server
                    -- „pausiert" sagt — das abmeldende Gerät quittierte seinen
                    -- Wunsch und startete die Ortung wieder. Ein Jahr
                    -- Rückdatierung deckt jedes Funkloch; `-infinity` deckt nur
                    -- einen manipulierten Client.
                    greatest(
                      least(coalesce(p_gesetzt_am, now()), now()),
                      now() - interval '1 year'
                    )
                  )
           else null
         end
   where hunt_id = p_hunt_id
     and user_id = auth.uid()
     -- Nur die eigene, TEILNEHMENDE Zeile. Wer eingeladen, abgesagt oder
     -- ausgetreten ist, sendet ohnehin nichts (positions_insert_own prüft
     -- `joined`) — und ein Zustand an einer solchen Zeile wäre eine Anzeige
     -- ohne Gegenstand.
     and status = 'joined'
  returning ortung_pausiert_seit into ergebnis;

  get diagnostics betroffen = row_count;

  -- Der 0-Zeilen-Riegel, wörtlich aus 067: ohne ihn hätte die Funktion genau
  -- den Fehler, gegen den sie gebaut ist — nichts getan, Erfolg gemeldet
  -- (S1). Er trifft drei Lagen: keine Teilnahme, nicht `joined` (etwa
  -- inzwischen entfernt), oder eine fremde/erfundene `p_hunt_id`.
  if betroffen = 0 then
    raise exception 'Keine offene Teilnahme an dieser Jagd gefunden';
  end if;

  -- Der gesetzte Zeitstempel geht zurück an den Client, damit er seinen
  -- lokalen Spiegel nicht schätzen muss. Bei einem idempotenten zweiten
  -- Aufruf ist das der ALTE Wert — und genau der gehört angezeigt.
  return ergebnis;
end;
$$;

comment on function public.ortung_pausieren(uuid, boolean, timestamptz) is
  'CN-195: setzt hunt_participants.ortung_pausiert_seit an der eigenen '
  'joined-Zeile. true = Pause (idempotent, der erste Zeitpunkt gewinnt), '
  'false = wieder senden. Wirft bei 0 getroffenen Zeilen.';

-- `anon` und `service_role` namentlich mit-widerrufen: Supabase vergibt
-- EXECUTE auf neue Funktionen im public-Schema per ALTER DEFAULT PRIVILEGES
-- EXPLIZIT an anon, authenticated und service_role. Ein `revoke … from
-- public` allein räumt nur den PUBLIC-Eintrag ab und lässt die drei
-- unberührt — gemessen am 31.07.2026 an `stand_ist_belegt()`, und
-- gemessen am 18.09.2026 an `set_position_consent`, die genau deshalb bis
-- heute für `anon` ausführbar ist.
revoke all     on function public.ortung_pausieren(uuid, boolean, timestamptz) from public, anon, service_role;
grant  execute on function public.ortung_pausieren(uuid, boolean, timestamptz) to authenticated;

commit;


-- ===========================================================================
-- GEGENPROBEN (nach dem Apply in EINEM Editor-Lauf ausführen)
-- ===========================================================================
--
-- Die IDs sind Platzhalter und werden fest verdrahtet — nicht per Sub-SELECT
-- suchen (AGENTS.md, SQL-Regeln). Jede Probe trägt eine Kontextzeile mit
-- `current_user` UND `auth.uid()`: ohne umgebendes `begin` wirkt
-- `set local role` NICHT, die Probe liefe als `postgres` und meldete falsch
-- „kein Fehler" (belegt an 111).
--
-- ---------------------------------------------------------------------------
-- P1 — Die Rechte: anon darf nicht, authenticated darf
-- ---------------------------------------------------------------------------
-- select p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
--        has_function_privilege('service_role',  p.oid, 'EXECUTE') as svc
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'ortung_pausieren';
-- ERWARTET: anon = false, authed = true, svc = false
--
-- ---------------------------------------------------------------------------
-- P2 — pg_temp am ENDE (muss 0 Zeilen liefern)
-- ---------------------------------------------------------------------------
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef
--    and coalesce(array_to_string(p.proconfig, ','), '') not like '%pg_temp%';
--
-- ---------------------------------------------------------------------------
-- P3 — Positivkontrolle: der eigene Teilnehmer pausiert, idempotent
-- ---------------------------------------------------------------------------
-- ⛔ **`pg_sleep` taugt hier NICHT als Orakel** (Fremdprüfung 18.09.2026,
-- Paket A, O3): `now()` ist innerhalb EINER Transaktion konstant, beide
-- Aufrufe bekämen also auch OHNE `coalesce` denselben Wert — die Probe wäre
-- grün, ohne die Idempotenz je berührt zu haben. Der Unterschied muss aus
-- einem EIGENEN, deutlich älteren Zeitpunkt kommen.
--
-- begin;
-- set local role authenticated;
-- set local "request.jwt.claim.sub" = '<eigene-uuid>';
-- select current_user, auth.uid();                      -- Kontextzeile
-- select public.ortung_pausieren('<hunt-id>', true, now() - interval '3 hours')
--        as erster_aufruf;
-- -- ERWARTET: ein Zeitstempel von VOR DREI STUNDEN (p_gesetzt_am wirkt).
-- select public.ortung_pausieren('<hunt-id>', true, now())
--        as zweiter_aufruf;
-- -- ERWARTET: DERSELBE Wert wie oben, also weiterhin vor drei Stunden.
-- --           Kommt hier `now()`, ist `coalesce` wirkungslos.
-- select public.ortung_pausieren('<hunt-id>', false) as wieder_an;
-- -- ERWARTET: null
-- select public.ortung_pausieren('<hunt-id>', true, now() + interval '2 days')
--        as zukunft;
-- -- ERWARTET: NICHT in zwei Tagen, sondern jetzt (`least(…, now())`).
-- rollback;
--
-- ---------------------------------------------------------------------------
-- P4 — Negativkontrolle: fremde Jagd
-- ---------------------------------------------------------------------------
-- begin;
-- set local role authenticated;
-- set local "request.jwt.claim.sub" = '<eigene-uuid>';
-- select current_user, auth.uid();
-- select public.ortung_pausieren('<fremde-hunt-id>', true);
-- -- ERWARTET: Ausnahme „Keine offene Teilnahme an dieser Jagd gefunden",
-- -- NICHT null und NICHT „0 rows". Ein stiller Erfolg wäre der Befund.
-- rollback;
--
-- ---------------------------------------------------------------------------
-- P5 — Negativkontrolle: NULL-Argument
-- ---------------------------------------------------------------------------
-- begin;
-- set local role authenticated;
-- set local "request.jwt.claim.sub" = '<eigene-uuid>';
-- select public.ortung_pausieren('<hunt-id>', null);
-- -- ERWARTET: Ausnahme „beide Argumente sind Pflicht"
-- rollback;
--
-- ---------------------------------------------------------------------------
-- P6 — Die Spalte ändert nichts an bestehenden Zeilen
-- ---------------------------------------------------------------------------
-- select count(*) as gesamt,
--        count(ortung_pausiert_seit) as pausiert
--   from hunt_participants;
-- -- ERWARTET: pausiert = 0
