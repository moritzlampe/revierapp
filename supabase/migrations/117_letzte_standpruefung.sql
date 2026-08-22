-- 117: Die letzte Standprüfung je Kartenobjekt — als View
--
-- ANLASS (Moritz, 22.08.2026): „wir haben in der native app bereits drin, dass
-- wir den Zustand von Ständen erfassen. Mir fehlt jetzt die entsprechende Seite
-- im Portal." Konzept: docs/konzepte/QuickHunt_Konzept_Standzustand_V1.md.
--
--
-- WARUM EINE VIEW UND NICHT DREIMAL CLIENT-CODE
--
-- Die eine Frage, die eine Prüfübersicht stellt, lautet „was gilt jetzt je
-- Objekt". Das Log aus 066 beantwortet sie mit `order by checked_at desc limit
-- 1` je Objekt — Postgres kann das in einem Schritt, PostgREST nicht.
--
-- Der native Client baut es deshalb heute von Hand nach (`fetchDistrictChecks`
-- in `src/lib/data/checks.ts`): ganze Historie absteigend holen, je Objekt die
-- erste behalten, gedeckelt bei `HISTORY_LIMIT = 2000`. **Ab dieser Grenze wird
-- es still falsch** — ein Stand, dessen Sperre unter das Limit rutscht,
-- erscheint als „nie geprüft". Der Code warnt laut, aber heilen kann er es
-- nicht.
--
-- Mit Portal und PWA kämen zwei weitere Kopien derselben Logik dazu. Drei
-- Kopien sind drei Gelegenheiten, sie unterschiedlich falsch zu machen — und
-- die Zusammenfassung („172 Sitze · 27 offen · 2 gesperrt") wäre je Client eine
-- andere Wahrheit. Genau das soll sie nicht sein.
--
--
-- WARUM `id` ALS ZWEITES SORTIERKRITERIUM
--
-- `checked_at` allein ist keine totale Ordnung: zwei Prüfungen mit demselben
-- Zeitstempel machen „die erste" beliebig, und die Anzeige könnte zwischen zwei
-- Lesungen kippen, ohne dass sich etwas geändert hätte. `id` ist willkürlich,
-- aber stabil. (Codex-Befund vom 28.07.2026; im Client-Code steht die Regel
-- bereits, hier zieht sie nach.)
--
--
-- WARUM `security_invoker = true` — PFLICHT, NICHT KOSMETIK
--
-- Eine View läuft sonst mit den Rechten ihres EIGENTÜMERS. Aus einer Migration
-- heraus angelegt gehört sie `postgres` und umginge RLS vollständig: jeder
-- Angemeldete sähe jede fremde Prüfung, samt Notiz und Revierbezug. Der
-- Schalter dreht das auf die Rechte des Aufrufers. Dieselbe Begründung wie in
-- 110, und derselbe Grund, warum die View HIER steht und nicht in einer
-- späteren Portal-Sitzung: wer sie dort ohne den Schalter anlegt, baut das Leck.
--
--
-- WARUM DER JOIN AUF map_objects — UND WARUM ER KEIN ZWEITER RIEGEL IST
--
-- Er trägt `district_id` mit. Ohne sie müsste jeder Client die Prüfungen über
-- eine PostgREST-Einbettung an die Objekte hängen, um auf ein Revier
-- einzuschränken — die Übersicht ist aber immer eine Revierfrage.
--
-- **`type` und `name` des Objekts standen im ersten Entwurf hier und sind
-- wieder raus** (Ponytail, 22.08.2026), zusammen mit `c.id`. Der Grund ist ein
-- Denkfehler, den sie verdeckten: **diese View liefert nur Objekte, die schon
-- einmal geprüft wurden.** Die wichtigste Zahl der Übersicht — „27 offen" — ist
-- aber genau die Menge OHNE Zeile hier. Jeder Aufrufer muss also ohnehin die
-- Objektliste laden und dagegen rechnen; und wer sie hat, hat Name und Typ
-- längst. `c.id` wiederum ist kein Schlüssel: `distinct on` macht
-- `map_object_id` eindeutig.
--
-- Sicherheitstechnisch fügt der Join NICHTS hinzu, und das ist Absicht: die
-- Read-Policy aus 066 prüft bereits `exists (select 1 from map_objects …)`, und
-- unter `security_invoker` gilt darin die RLS von `map_objects` mit. Der Join
-- erbt dieselbe Bedingung, statt eine zweite danebenzustellen — eine
-- nachgebaute Bedingung wäre eine zweite Wahrheit, die beim nächsten
-- Policy-Wechsel still auseinanderläuft (wörtlich die Begründung aus 066).
--
-- **Der Papierkorb-Filter steht trotzdem ausdrücklich da, und der erste Entwurf
-- hatte ihn nicht.** Die Begründung dort lautete: alle fünf SELECT-Policies auf
-- `map_objects` tragen `deleted_at is null` (gemessen 22.08.2026), ein
-- gelöschtes Objekt falle also von selbst heraus. **Die Fremdprüfung hat den
-- Satz gekippt (Codex, 22.08.2026, Punkt 6): `service_role` umgeht RLS.** Für
-- diese Rolle galt die Zusage nicht, und der Fall ist nicht konstruiert — ein
-- Wartungs-Reminder als Edge Function ist die naheliegendste Fortsetzung dieses
-- Features und würde weich gelöschte Stände mitzählen.
--
-- Dass der Filter eine „zweite Wahrheit" neben den Policies ist, wiegt hier
-- nicht auf: er ist **fachlich** und nicht als Riegel gedacht. Ein gelöschtes
-- Objekt hat keinen geltenden Zustand — unabhängig davon, wer fragt.
--
--
-- WARUM KEIN JOIN AUF profiles
--
-- „Geprüft von" braucht einen Namen — 066 sagt ausdrücklich, ohne ihn sei die
-- Zeile wertlos. Trotzdem bleibt hier nur `checked_by` als uuid stehen, und den
-- Namen holt der Client wie bisher über die PostgREST-Einbettung.
--
-- Der Grund ist Migration 116, die parallel entsteht: sie macht `profiles` nur
-- noch über Chat- oder Jagdbeziehung sichtbar. Ein Prüfer, der über einen
-- Begehungsschein am Revier hängt und mit dem Besitzer weder in einem Chat noch
-- in einer Jagd ist, hätte danach keinen lesbaren Namen mehr — und 066 sagt
-- ausdrücklich, ohne ihn sei die Zeile wertlos.
--
-- **Der Fall ist bereits versorgt, und zwar nicht hier:** 115 (`konto_namen()`)
-- führt `src/lib/data/checks.ts:16` namentlich als einen von drei
-- Namensauflösern, die weder Chat noch Jagd sind. Der Name kommt danach über
-- die RPC statt über eine Profil-Einbettung.
--
-- **Für diese View ändert das nichts, und genau deshalb steht es hier:** sie
-- gibt `checked_by` als uuid heraus und bleibt von der Frage unabhängig. Wäre
-- der Name hier eingebaut, hinge die Anzeige des Prüfprotokolls an der
-- Reihenfolge zweier fremder Migrationen.
--
--
-- WAS DIESE MIGRATION NICHT TUT
--
-- Sie ist rein additiv: kein DDL an `map_object_checks`, keine Policy-Änderung,
-- kein Grant. Supabase vergibt SELECT auf neue Views automatisch an `anon`,
-- `authenticated` und `service_role` (an den vier Views aus 110 gemessen); für
-- `anon` liefert sie unter `security_invoker` null Zeilen, weil `map_objects`
-- für diese Rolle zu ist. Kein `to authenticated`-Fall wie in 078: die Policies
-- darunter rufen an dieser Stelle keine Funktion, die `anon` verweigert wäre —
-- `anon` bekommt eine leere Liste, keinen 42501.
--
-- **Sie schließt insbesondere NICHT den Zukunfts-Zeitstempel.**
-- Die Fremdprüfung hat ihn hier gefunden (Codex, 22.08.2026, Punkt 7):
-- `checked_at` ist client-bestimmbar, `map_object_checks` hat keinen Trigger und
-- keinen CHECK darauf, und wer eine Zeile mit `'infinity'` oder einem Datum in
-- zehn Jahren schreibt, ist danach dauerhaft „die jüngste Prüfung". Ein `ok` mit
-- Zukunftsdatum macht damit **jede spätere Sperre unsichtbar** — genau die
-- stille Falschauskunft über einen sicherheitsrelevanten Zustand, gegen die
-- 066 gebaut wurde.
--
-- **Der Fehler ist vorbestehend und nicht von dieser View eingeführt** — der
-- native Client sortiert seit dem 28.07.2026 nach demselben Kriterium. Die View
-- macht ihn nur zur einzigen Wahrheit für alle drei Clients. Der Riegel gehört
-- deshalb in eine eigene Migration: er sitzt auf einem SCHREIBpfad und braucht
-- eigene Gegenproben, die View sitzt auf einem Lesepfad und braucht andere.
--
-- **Die Form liegt fest, die Nummer bewusst noch nicht** (22.08.2026): ein
-- BEFORE-INSERT-Trigger nach dem Muster aus 091, `coalesce(new.checked_at,
-- now()) > now() + interval '15 minutes'` mit `errcode
-- 'integrity_constraint_violation'`. Nur nach vorn — Rückdatierung ist bei einer
-- Prüfung legitim („gestern abgegangen, heute eingetragen"), und ein
-- `-infinity` sortiert nach unten und wird nie „die jüngste". `'infinity'` deckt
-- dieselbe Bedingung mit ab. Eine Nummer wird erst reserviert, wenn der Riegel
-- gebaut wird; eine verbrannte Reservierung ist eine Lücke in der Reihenfolge
-- beim Neuaufbau.
--
-- Sie ändert AUCH NICHTS an der Alterung: dass „geprüft und heil" mit dem
-- Jagdjahr verfällt, „Mangel" und „gesperrt" dagegen bis zum Widerruf gelten,
-- ist eine Anzeigeregel und steht bewusst im Client (Konzept §4.1.1). Eine View,
-- die das Jagdjahr einrechnete, wäre am 1. April eine andere View.

create or replace view public.map_object_letzte_pruefung
  with (security_invoker = true) as
select distinct on (c.map_object_id)
       c.map_object_id,
       o.district_id,
       c.status,
       c.checked_at,
       c.checked_by,
       c.note
  from public.map_object_checks c
  join public.map_objects o on o.id = c.map_object_id
 where o.deleted_at is null
 order by c.map_object_id, c.checked_at desc, c.id desc;

comment on view public.map_object_letzte_pruefung is
  'Die juengste Pruefzeile je Kartenobjekt (117). Alle Clients lesen den aktuellen '
  'Zustand ueber diese View, nicht ueber map_object_checks: das Client-Dedup wird ab '
  'HISTORY_LIMIT still falsch, und drei Kopien waeren drei Wahrheiten. Sortierung '
  'checked_at desc, id desc — id ist Pflicht, checked_at allein ist keine totale '
  'Ordnung. security_invoker = true, RLS von map_object_checks UND map_objects gilt. '
  'Geloeschte Objekte haelt der EIGENE where-Filter heraus, nicht die RLS: '
  'service_role umgeht Policies, und ein Reminder als Edge Function zaehlte sonst '
  'weich geloeschte Staende mit. Ohne Namensspalte: checked_by bleibt uuid, den Namen '
  'holt der Client ueber konto_namen() aus 115.';

-- ---------------------------------------------------------------------------
-- Gegenproben — laufen NACH dem Applizieren (die View gibt es vorher nicht),
-- jede in einer Transaktion mit ROLLBACK.
-- ---------------------------------------------------------------------------
--   1. Der Schalter sitzt:
--      select reloptions from pg_class where relname = 'map_object_letzte_pruefung';
--      -> muss {security_invoker=true} enthalten
--
--   2. Genau eine Zeile je Objekt, und es ist die juengste:
--      select count(*) = count(distinct map_object_id) from public.map_object_letzte_pruefung;
--      -> true
--
--   3. Gegen die Handrechnung, nicht gegen sich selbst. Verglichen wird über
--      (status, checked_at) — `check_id` gibt die View bewusst nicht aus:
--      select v.map_object_id, v.status, v.checked_at, h.status, h.checked_at
--        from public.map_object_letzte_pruefung v
--        join lateral (select c.status, c.checked_at
--                        from public.map_object_checks c
--                       where c.map_object_id = v.map_object_id
--                       order by c.checked_at desc, c.id desc
--                       limit 1) h on true
--       where (v.status, v.checked_at) is distinct from (h.status, h.checked_at);
--      -> 0 Zeilen
--
--   4. Der Gleichstands-Fall, der `id` rechtfertigt — zwei Zeilen, EIN
--      Zeitstempel, danach ROLLBACK.
--
--      **Die `id`s MUESSEN fest verdrahtet sein.** Der erste Entwurf liess sie
--      aus `uuid_generate_v4()` kommen und erwartete, zwei Laeufe lieferten
--      dieselbe Zeile — falsch: jeder Lauf wuerfelt neu, und ob A oder B
--      gewinnt, kippt zwischen den Laeufen. Die Probe haette einen KORREKTEN
--      Zustand als Fehlschlag gemeldet (Schlusslesung 22.08.2026).
--      Mit festen ids ist der Sieger vorhersagbar: die groessere gewinnt.
--      begin;
--        insert into public.map_object_checks (id, map_object_id, checked_by, checked_at, status, note)
--        values ('00000000-0000-4000-8000-00000000000a','<oid>','<uid>','2026-08-22 10:00:00+02','ok',      'A'),
--               ('00000000-0000-4000-8000-00000000000b','<oid>','<uid>','2026-08-22 10:00:00+02','gesperrt','B');
--        select status, note from public.map_object_letzte_pruefung where map_object_id = '<oid>';
--      rollback;
--      -> genau EINE Zeile, und zwar 'gesperrt'/'B' (…000b > …000a)
--
--   5. RLS traegt — mit Kontextzeile, sonst misst man postgres (s. 111):
--      begin;
--        set local role authenticated;
--        set local "request.jwt.claim.sub"  = '<fremde uid>';
--        set local "request.jwt.claim.role" = 'authenticated';
--        select current_user, auth.uid();
--        select count(*) from public.map_object_letzte_pruefung
--         where district_id = 'fdaf24a7-6467-40e7-952b-91deceaae53e';   -- Soeder
--      rollback;
--      -> 0 fuer einen Fremden, > 0 fuer den Besitzer (Positivkontrolle)
--
--   6. anon laeuft leer statt zu brechen:
--      begin; set local role anon;
--        select count(*) from public.map_object_letzte_pruefung;
--      rollback;
--      -> eine Zahl (0), kein 42501
--
--   7. Ein geloeschtes Objekt faellt heraus:
--      -> Objekt in den Papierkorb legen, View zaehlen, wiederherstellen
