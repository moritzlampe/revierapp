-- 119: Eine Standprüfung kann nicht in der Zukunft liegen
--
-- ANLASS: CN-80, vorbestehend seit 066, gefunden von der Fremdprüfung zu 117
-- (25.08.2026 von Moritz freigegeben). `map_object_checks.checked_at` ist
-- client-bestimmbar — die Spalte hat weder Trigger noch CHECK —, und die View
-- `map_object_letzte_pruefung` (117) nimmt je Objekt die JÜNGSTE Zeile.
--
-- **Ein `ok` mit Zukunftsdatum ist damit dauerhaft Sieger und macht jede
-- spätere Sperre unsichtbar.** Der Stand zeigt „geprüft, alles heil", während
-- die Sperre darunter liegt und nie wieder nach oben kommt.
--
--
-- WOGEGEN 119 NICHT HILFT — UND DAS GEHÖRT IN DIESE DATEI, NICHT NUR IN DIE
-- BEGRÜNDUNG
--
-- Hier stand: „das ist die Lüge, gegen die 066 gebaut wurde". **Der Satz ist
-- eine Nummer zu groß, und die Schlusslesung vom 26.08.2026 hat darauf
-- bestanden, dass die Einschränkung in den `.sql`-TEXT wandert** — er ist
-- das, was im Migrationskatalog und im Repo überdauert; eine Begründungsdatei
-- daneben liest nicht jeder.
--
-- Gemessen am 26.08.2026 lautet die INSERT-Policy dieser Tabelle:
--
--     checked_by = auth.uid()
--     AND EXISTS (SELECT 1 FROM map_objects o WHERE o.id = ...map_object_id)
--
-- Der `EXISTS` prüft nur die EXISTENZ des Objekts — den Zugriffsfilter
-- liefert allein die RLS von `map_objects` im Subquery. **Wer ein
-- Kartenobjekt lesen darf, darf eine Prüfung dazu schreiben**, und damit
-- fällt eine fremde Sperre auch mit einem ganz gewöhnlichen `ok` mit
-- Serverzeit — ohne jeden Zeitstempel-Trick. Im Portal-Track als **CP-80**
-- geführt, Nachbarschaft von CN-81.
--
-- **119 schließt also nur die DAUERHAFTE, nicht heilende Variante.** Ein
-- Zukunftsdatum gewinnt für immer; ein `ok` mit Serverzeit nur bis zur
-- nächsten Meldung. Das ist den Trigger wert — aber wer 119 und CP-80
-- nebeneinander liest, darf nicht glauben, diese Datei decke beides ab.
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
--   * **Portal: setzte DOCH** — `app/zentrale/objekt-inspektor.tsx:885`
--     schickte `checked_at: wann.toISOString()`, und für den heutigen Tag
--     entstand `wann` aus `new Date()`. **Das war die PC-Uhr.**
--     ✅ **Erledigt am 26.08.2026** (CN-85, Commit `63d20c6`, deployt): der
--     Nachtragsweg schickt `checked_at` nur noch bei ECHTER Rückdatierung,
--     für „heute" greift `default now()`. Ein Wert aus diesem Pfad kann den
--     Trigger per Konstruktion nie treffen.
--
-- **Wie der Irrtum entstand, gehört dazu:** ich hatte per `grep` gesucht und
-- „nichts gefunden" als „gibt es nicht" gelesen. Der Portal-Pfad kam am
-- selben Tag aus dem Nachbarstrang dazu. Ein `grep`, der nichts findet,
-- belegt, dass das Muster nichts fand — nicht die Abwesenheit der Sache.
--
-- **Folge, und sie war die wichtigste Zeile dieser Datei:** eine vorgehende
-- PC-Uhr lässt einen legitimen Portal-Eintrag am Trigger scheitern. Solange
-- ein Client die eigene Uhr schickt, steht „melden wird nie verhindert"
-- gegen diesen Riegel — und die Regel gewinnt.
--
-- **Für das Portal ist das seit dem 26.08.2026 erledigt. Für die Feld-App
-- kommt es mit CN-88 zurück** — dort löst es Weg 1 im Client (s. „DIE FORM
-- DER GRENZE"). Der Satz bleibt also stehen, weil er die Regel benennt, an
-- der sich JEDER künftige Schreibpfad messen lassen muss, nicht bloß den
-- einen erledigten Fall.
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
-- ⚠ **DAMIT DURFTE DIESE MIGRATION ERST NACH DEM PORTAL APPLIZIERT WERDEN.**
-- Ohne Toleranz scheitert jede Portal-Meldung, deren PC-Uhr auch nur
-- Sekunden vorgeht. Die Reihenfolge war zwingend — **und ist am 26.08.2026
-- vollständig durchlaufen:**
--
--   1. ✅ Portal stellt den heutigen Fall auf `default now()` um
--      (`objekt-inspektor.tsx` — **fremder Track, R1**, vom PWA-Strang
--      erledigt)
--   2. ✅ Portal ist deployt — Commit `63d20c6`, Coolify `finished`
--   3. ✅ DANN diese Migration — hier stehen wir
--
-- **Wer diesen Absatz liest, ohne die Häkchen zu beachten, hält eine
-- erledigte Blockade für offen.** Deshalb stehen sie da und nicht nur in der
-- Begründungsdatei.
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
--   * **Keine Toleranz** (s. oben). Wer einen Zeitstempel schickt, bekommt
--     die Servergrenze.
--     ⚠ **Hier stand „der legitime Weg schickt gar keinen Zeitstempel" —
--     das war zum Zeitpunkt der Fremdprüfung wahr und ist es seit CN-88
--     nicht mehr** (Schlusslesung 26.08.2026, B2). Die Feld-App schickt
--     künftig den MELDEZEITPUNKT aus der Geräteuhr, damit eine Revierrunde
--     im Funkloch nicht mit lauter identischen Uhrzeiten in der Historie
--     steht. Der Riegel dagegen sitzt im Client (Weg 1, entschieden von
--     Moritz am 26.08.2026): den Zeitstempel nur mitschicken, wenn der
--     Eintrag tatsächlich gewartet hat, und bei `23514` **einmal ohne ihn
--     wiederholen** — die Meldung geht dann durch und verliert nur die
--     genaue Uhrzeit. **Melden wird nie verhindert, auch nicht von diesem
--     Trigger.**
--   * **INSERT UND UPDATE.** `map_object_checks` hat heute weder UPDATE- noch
--     DELETE-Policy — der UPDATE-Zweig ist also unerreichbar. Er steht
--     trotzdem da: kommt je eine Policy, gilt der Riegel ohne dass jemand
--     daran denken muss. Das ist billiger als die Erinnerung.
--   * **Für JEDE Prüfung, nicht nur `ok`.** Auch ein zukunftsdatiertes
--     `gesperrt` ist Unsinn — es hinge in der Jagdjahr-Rechnung im falschen
--     Jahr.
--
--
-- ⚠ EINE AUFLAGE AN JEDEN KÜNFTIGEN TRIGGER DIESER TABELLE
--
-- Heute ist `trg_map_object_checks_zeitpunkt` der EINZIGE Trigger auf
-- `map_object_checks` (gegen `pg_trigger` verifiziert, 26.08.2026).
-- **BEFORE-Trigger feuern ALPHABETISCH** — die Falle aus 096, hier vorwärts
-- gedacht (Schlusslesung 26.08.2026, T10).
--
-- Kommt je ein zweiter BEFORE-Trigger, der `checked_at` SETZT statt es nur zu
-- prüfen — genau das wäre „Weg 2" mit `checked_at = least(reported_at,
-- clock_timestamp())` —, und sortiert sein Name alphabetisch NACH
-- `trg_map_object_checks_zeitpunkt`, dann **validiert 119 einen Wert, der
-- danach ersetzt wird**: der Riegel prüft etwas, das gar nicht gespeichert
-- wird. Er sähe weiterhin aus wie ein Riegel.
--
-- Wer so etwas baut, sortiert den Namen VOR `…_zeitpunkt` ein oder ersetzt
-- 119 gleich mit.
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
