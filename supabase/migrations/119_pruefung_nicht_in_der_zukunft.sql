-- 119: Eine Standprüfung kann nicht in der Zukunft liegen
--
-- ANLASS: CN-80, vorbestehend seit 066, gefunden von der Fremdprüfung zu 117
-- (25.08.2026 von Moritz freigegeben). `map_object_checks.checked_at` ist
-- client-bestimmbar — die Spalte hat weder Trigger noch CHECK —, und die View
-- `map_object_letzte_pruefung` (117) nimmt je Objekt die JÜNGSTE Zeile.
--
-- **Ein `ok` mit Zukunftsdatum ist damit dauerhaft Sieger und macht jede
-- spätere Sperre unsichtbar.** Das ist die Lüge, gegen die 066 gebaut wurde,
-- nur eine Ebene tiefer: der Stand zeigt „geprüft, alles heil", während die
-- Sperre darunter liegt und nie wieder nach oben kommt.
--
--
-- WARUM DIE CLIENT-RIEGEL NICHT GENÜGEN — UND DAS IST DIE EIGENTLICHE
-- BEGRÜNDUNG
--
-- Portal und PWA haben die NAHE Zukunft am 25.08.2026 client-seitig
-- geschlossen (`inDieserSaison` verlangt dort zusätzlich `wann <= jetzt`).
-- Die Feld-App hat die Lücke noch. Der Zwischenstand war also: zwei von drei
-- Clients streng.
--
-- **Der Riegel wandert genau so weit wie das Modul, und Module enden an
-- Repo-Grenzen. Zeilen tun das nicht.** (Formulierung des PWA-Strangs,
-- 25.08.2026.) Portal und PWA teilen sich `revierapp/src/lib/revier/
-- wartung.ts` — dorthin ist der Riegel mitgewandert. Über die Repo-Grenze
-- nach `quickhunt-native/src/lib/revier/wartung.ts` tut er es nicht, und zum
-- vierten Client (curl mit eigenem Token) schon gar nicht.
--
-- Dieselbe Bauform wie bei 117 selbst: die Frage „was gilt jetzt je Objekt"
-- gehört EINMAL beantwortet, nicht dreimal.
--
--
-- WER `checked_at` SETZT — KORRIGIERT, WEIL MEINE ERSTE FASSUNG FALSCH WAR
--
-- Der Kopf behauptete zuerst: **kein** Client setzt `checked_at`, überall
-- greife der `default now()`, und eine falsche Geräteuhr könne deshalb keine
-- echte Meldung verhindern. **Die Fremdprüfung (25.08.2026) hat das
-- widerlegt, und die Gegenprobe gibt ihr recht:**
--
--   * **Feld-App: setzt NICHT.** `insertCheck` (`src/lib/data/checks.ts`)
--     lässt die Spalte ausdrücklich weg, mit schriftlicher Begründung.
--   * **PWA: setzt NICHT.**
--   * **Portal: setzt DOCH** — `app/zentrale/objekt-inspektor.tsx:885`
--     schickt `checked_at: wann.toISOString()`, und für den heutigen Tag
--     entsteht `wann` aus `new Date()`. **Das ist die PC-Uhr.**
--
-- **Wie der Irrtum entstand, gehört dazu:** ich hatte per `grep` gesucht und
-- „nichts gefunden" als „gibt es nicht" gelesen. Der Portal-Pfad kam am
-- selben Tag aus dem Nachbarstrang dazu. Ein `grep`, der nichts findet,
-- belegt, dass das Muster nichts fand — nicht die Abwesenheit der Sache.
--
-- **Folge, und sie ist die wichtigste Zeile dieser Datei:** eine vorgehende
-- PC-Uhr lässt einen legitimen Portal-Eintrag am Trigger scheitern. Solange
-- das Portal die Client-Uhr schickt, steht „melden wird nie verhindert"
-- gegen diesen Riegel — und die Regel gewinnt.
--
--
-- WARUM DIE TOLERANZ AUF NULL STEHT — UND WAS DAS ERZWINGT
--
-- Der erste Entwurf übernahm die 15 Minuten aus 091. **Das war falsch, und
-- die Fremdprüfung hat den Grund benannt** (`[high]`): bei 091 zielt der
-- Angriff auf Schein-Grenzen, die Tage bis Monate entfernt liegen — eine
-- Viertelstunde ist dort wertlos. **Hier ist der Angriff ein Wettlauf um die
-- Sortierung**, und da ist eine Viertelstunde alles:
--
--   Ein `ok` mit +15 Minuten versteckt jede `gesperrt`-Zeile, die in diesem
--   Fenster mit Serverzeit geschrieben wird. **Und das heilt nicht nach
--   Ablauf der Viertelstunde** — die gespeicherten Zeitstempel ändern sich
--   nicht. Die Sperre bleibt unsichtbar, bis jemand eine NEUE Prüfung
--   einträgt.
--
-- Also keine Toleranz: `new.checked_at > now()` wird abgelehnt.
--
-- ⚠ **DAMIT DARF DIESE MIGRATION ERST NACH DEM PORTAL APPLIZIERT WERDEN.**
-- Ohne Toleranz scheitert jede Portal-Meldung, deren PC-Uhr auch nur
-- Sekunden vorgeht. Die Reihenfolge ist zwingend:
--
--   1. Portal stellt den heutigen Fall auf `default now()` um
--      (`objekt-inspektor.tsx`, Zeile 885 — **fremder Track, R1**)
--   2. Portal ist deployt
--   3. DANN diese Migration
--
-- Dieselbe Bauform wie 115 → 116: eine Reihenfolge, die nur in einem
-- Kommentar steht, ist keine. Deshalb steht sie hier UND in der
-- Begründungsdatei UND als Backlog-Punkt.
--
--
-- WARUM EIN TRIGGER UND NICHT EIN CHECK — KORRIGIERT UND GEMESSEN
--
-- Der Kopf behauptete zuerst, ein CHECK sei unmöglich, weil `now()` nicht
-- IMMUTABLE ist. **Das ist falsch, und die Gegenprobe hat es widerlegt:**
-- `alter table … add constraint … check (wann <= now() + interval '15
-- minutes')` läuft durch (an einer temporären Tabelle gemessen, 25.08.2026).
-- Postgres SETZT bei CHECK-Ausdrücken Unveränderlichkeit voraus, es ERZWINGT
-- sie nicht.
--
-- **Der Trigger bleibt trotzdem, jetzt mit dem richtigen Grund:** ein CHECK
-- mit `now()` ist genau die Bauform, deren Annahme Postgres dokumentiert und
-- nicht prüft — er wird nur bei INSERT/UPDATE ausgewertet und wäre bei einem
-- späteren `validate constraint` eine Zeitbombe. Dazu kommt: **091 löst
-- dieselbe Frage als Trigger.** Zwei Bauformen für dieselbe Sache sind teurer
-- als zwanzig Zeilen, und der Trigger liefert obendrein einen Satz statt
-- „violates check constraint".
--
--
-- DIE FORM DER GRENZE — zeichengleich zu 091, und aus denselben Gründen
--
--   * **Nur nach vorn.** Der legitime Wert liegt in der Vergangenheit:
--     angesehen, Sekunden später eingetragen. **Rückdatierung bleibt
--     ausdrücklich offen** — „gestern abgegangen, heute eingetragen" ist im
--     Kopf von 117 als legitim benannt, und ein Prüfeintrag mit altem Datum
--     verdrängt in der View ohnehin nichts Jüngeres.
--   * **Keine Toleranz** (s. oben). Der legitime Weg schickt gar keinen
--     Zeitstempel; wer einen schickt, bekommt die Servergrenze.
--   * **INSERT UND UPDATE.** `map_object_checks` hat heute weder UPDATE- noch
--     DELETE-Policy — der UPDATE-Zweig ist also unerreichbar. Er steht
--     trotzdem da: kommt je eine Policy, gilt der Riegel ohne dass jemand
--     daran denken muss. Das ist billiger als die Erinnerung.
--   * **Für JEDE Prüfung, nicht nur `ok`.** Auch ein zukunftsdatiertes
--     `gesperrt` ist Unsinn — es hinge in der Jagdjahr-Rechnung im falschen
--     Jahr.
--
--
-- WARUM DIE FUNKTION KEIN `security definer` IST
--
-- Sie liest keine Tabelle. Sie vergleicht `new.checked_at` mit `now()` und
-- wirft. Invoker genügt, und damit entfällt die `pg_temp`-Falle aus 076 von
-- selbst — es gibt nichts zu shadowen.
--
-- **Der EXECUTE-Entzug steht trotzdem da** (082): `REVOKE … FROM PUBLIC,
-- anon, authenticated, service_role`, namentlich, weil `FROM PUBLIC` bei
-- Supabase gar nichts entzieht. Hier ist er Vorsorge und nicht Reparatur —
-- die Funktion trägt keine Rechte, die man stehlen könnte. Er kostet eine
-- Zeile und hält die Regel geschlossen, statt eine Ausnahme zu begründen,
-- über die der nächste nachdenken muss.
--
--
-- BESTAND: 4 Prüfzeilen (25.08.2026), alle im Testrevier L7, alle aus der
-- Vergangenheit. Die Migration trifft keine davon.
--
-- ⚠ NICHT APPLIZIEREN, solange das Portal `checked_at` aus der PC-Uhr
-- schickt (s. oben). Erst Portal, dann Deploy, dann diese Datei.
--
-- APPLY-WEG: `apply_migration` (MCP), wie 118. Kein `\set`, keine
-- Transaktionsklammer. Registriert wird mit eigenem Zeitstempel, nicht als
-- „119" — die Dateinummer ist die Reihenfolge des Repos.

create or replace function public.pruefung_nicht_in_der_zukunft()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.checked_at > now() then
    raise exception 'Eine Standprüfung kann nicht in der Zukunft liegen (%).', new.checked_at
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function public.pruefung_nicht_in_der_zukunft()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_map_object_checks_zeitpunkt on public.map_object_checks;

create trigger trg_map_object_checks_zeitpunkt
  before insert or update on public.map_object_checks
  for each row execute function public.pruefung_nicht_in_der_zukunft();

comment on function public.pruefung_nicht_in_der_zukunft() is
  'Migration 119: laesst checked_at nicht in der Zukunft liegen. Grund: checked_at ist client-bestimmbar, und die View map_object_letzte_pruefung (117) nimmt die juengste Zeile - ein ok mit Zukunftsdatum macht jede spaetere Sperre unsichtbar. Rueckdatierung bleibt erlaubt.';
