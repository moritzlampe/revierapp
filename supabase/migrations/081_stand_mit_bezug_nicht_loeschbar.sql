-- 081 — Ein Stand, an dem jemand eingelockt ist, lässt sich nicht löschen
--
-- Moritz, 31.07.2026, wörtlich: „wenn eine Person eingecheckt ist ist löschen
-- nicht möglich (sicherheitsrelevant), das wäre mir wichtig."
--
-- Die Sicherheitsrelevanz steht schon in 062, an der Realtime-Bindung des
-- Standbezugs: „die App zeigte den Stand aber weiter als besetzt — und der
-- Nachbar entscheidet daran, ob er in die Richtung schießen darf." Genau
-- dieselbe Richtung, nur andersherum: ein Stand, der während einer laufenden
-- Jagd von der Karte verschwindet, nimmt dem Nachbarn die Information, dass
-- dort jemand sitzt. Das Loch ist die gefährlichere Seite des Papierkorbs.
--
-- ---------------------------------------------------------------------------
-- Warum in der Funktion und nicht im Client
-- ---------------------------------------------------------------------------
--
-- Es gibt vier Löschknöpfe in zwei Apps, und alle vier laufen seit 073/074
-- durch `kartenobjekt_loeschen()`. Ein Riegel im Client wäre also viermal zu
-- bauen und dreimal zu vergessen — derselbe Gedanke wie beim Revier-Parameter
-- aus 074, und aus demselben Grund hier verankert.
--
-- ---------------------------------------------------------------------------
-- Warum der Jagd-Status mitgeprüft wird
-- ---------------------------------------------------------------------------
--
-- ACHTUNG, hier stand im ersten Entwurf eine falsche Behauptung — sie ist beim
-- Nachweislauf aufgeflogen und deshalb hier korrigiert festgehalten:
-- „`hunt_stand_bezug` wird nur beim Treiben-Ende aufgeräumt." Das stimmt NICHT.
-- Es gibt ZWEI Trigger, gemessen an `pg_trigger`:
--
--   trg_clear_stand_bezug_on_drive_end   auf hunt_drives, bei status -> completed  (062)
--   trg_hunts_stand_bezug_clear          auf hunts,       bei status -> completed
--                                        ODER auto_completed                       (065)
--
-- Für eine ordentlich beendete Jagd räumt 065 also bereits auf, und die
-- Status-Bedingung hier ist insoweit doppelt genäht. Sie trägt trotzdem, und
-- zwar für die Zustände, die KEIN Trigger anfasst:
--
--   * `draft` und `scheduled` — eine Jagd, die zurückgesetzt wurde, behält ihre
--     Bezugszeilen. Ohne die Bedingung wäre der Stand dauerhaft gesperrt,
--     obwohl niemand draußen ist. GENAU DAFÜR steht sie da.
--   * `active` ohne Ende — eine Jagd, die nie beendet wird, behält ihre Zeilen.
--     Hier SOLL gesperrt werden, und es wird gesperrt.
--
-- Bleibt ein Fall, den auch die Bedingung nicht auflöst: eine Jagd, die auf
-- `paused` stehen bleibt und nie beendet wird, sperrt ihren Stand auf Dauer.
-- Das ist die bewusste Wahl — `paused` heißt nicht, dass jemand vom Stand
-- geklettert ist, sondern ist der Zustand, in dem alle sitzen und warten.
-- Im Zweifel lieber ein Stand, der sich nicht löschen lässt, als einer, der
-- unter einem Sitzenden von der Karte verschwindet.
--
-- `paused` zählt dazu. Eine pausierte Jagd heißt nicht, dass jemand vom Stand
-- geklettert ist — im Gegenteil, sie ist der Zustand, in dem alle noch sitzen
-- und warten.
--
-- `draft`, `scheduled`, `completed`, `auto_completed` sperren nicht: dort ist
-- niemand draußen. (Alle sechs Werte des Enums `hunt_status` sind damit
-- entschieden.)
--
-- ---------------------------------------------------------------------------
-- Warum zwei Wege geprüft werden
-- ---------------------------------------------------------------------------
--
-- Nach dem Datenmodell trägt der Bezug eines FESTEN Standes seine
-- `map_object_id` (`stand-bezug.ts`: `kind === 'fixed' ? standId : null`), der
-- zweite Zweig über `hunt_seat_assignments.seat_id` ist also nach heutigem
-- Client-Code unerreichbar. Er steht trotzdem da: ein Sitzplan kann einen
-- festen Stand als `seat_id` führen, und wenn dort je jemand über die
-- Zuweisungs-id einlockt, muss der Riegel halten. Falsch sperren kann der
-- Zweig nicht — `seat_id = p_id` heißt, dass die Zuweisung genau dieser Stand
-- IST.
--
-- ---------------------------------------------------------------------------
-- Die Reihenfolge der vier Prüfungen, und warum jede dort steht
-- ---------------------------------------------------------------------------
--
-- 1. RECHT. „An diesem Stand sitzt jemand" ist eine grobe Aufenthaltsangabe
--    und damit dieselbe Vertraulichkeitsklasse, die 062 mit zwei Policies
--    schützt. Wer das Objekt gar nicht verwalten darf, bekommt deshalb weiter
--    nur die alte Absage und erfährt über die Belegung nichts.
--
-- 2. ZEILE (richtiges Revier, noch nicht geworfen). **Diese Prüfung muss VOR
--    der Belegung stehen** — im ersten Entwurf stand sie danach, und ein
--    Codex-Review hat den Fehler gefunden: ein belegter Stand aus Revier A,
--    versehentlich mit Revier B aufgerufen, hätte `55006` geliefert statt des
--    bisherigen `42501`. Der Nutzer läse „solange die Jagd läuft" und wartete
--    auf etwas, das nie eintritt: nach Jagdende scheitert derselbe Aufruf
--    weiter, nur mit anderem Grund. Ein Fehlercode darf nicht die Ursache
--    verdecken, die als erste greift.
--
-- 3. BELEGUNG → 55006.
--
-- 4. Das UPDATE, mit der Belegung NOCH EINMAL im WHERE — s. unten.
--
-- ---------------------------------------------------------------------------
-- Das Wettrennen zwischen Prüfen und Schreiben
-- ---------------------------------------------------------------------------
--
-- Prüfung und UPDATE sind zwei Anweisungen. Unter READ COMMITTED bekommt jede
-- ihren eigenen Snapshot, also kann sich zwischen Schritt 3 und Schritt 4
-- jemand einlocken und committen — die Prüfung sah ihn nicht, das UPDATE
-- schriebe trotzdem. Ein belegter Stand verschwände dann ohne Fehlermeldung
-- von der Karte. (Codex-Review, 31.07.2026, zu Recht als „hoch" bewertet.)
--
-- **Behoben, soweit es geht:** `not stand_ist_belegt(p_id)` steht zusätzlich
-- im WHERE des UPDATE. Weil das eine eigene Anweisung mit FRISCHEM Snapshot
-- ist, sieht sie ein Einlocken, das nach Schritt 3 committet hat, sehr wohl —
-- und trifft dann keine Zeile. Das Fenster zwischen Prüfung und Schreiben ist
-- damit zu.
--
-- **Was NICHT zu ist, und das gehört offen benannt:** committet das Einlocken
-- erst, nachdem das UPDATE seinen Snapshot genommen hat, gewinnt das Löschen.
-- Zwei Tabellen ohne Sperrbeziehung lassen sich hier nicht serialisieren; ein
-- Lock auf der `map_objects`-Zeile hilft nicht, weil der Einlock-Pfad sie gar
-- nicht anfasst.
--
-- Die saubere Gegenrichtung wäre, den Einlock-Pfad zu verriegeln: ein Bezug
-- auf ein geworfenes Objekt dürfte gar nicht erst entstehen. Das gehört an die
-- Policies von `hunt_stand_bezug` (062) und ist bewusst NICHT Teil dieser
-- Migration — es ist die andere Hälfte derselben Eigenschaft und braucht eine
-- eigene Entscheidung. Notiert für den Backlog.
--
-- ---------------------------------------------------------------------------
-- Fehlercode
-- ---------------------------------------------------------------------------
--
-- `55006 object_in_use`, nicht `42501`. Der Unterschied ist der ganze Zweck:
-- „Du darfst das nicht" und „gerade jetzt nicht, weil dort jemand sitzt" sind
-- verschiedene Sätze, und der zweite ist der einzige, der dem Nutzer sagt, was
-- er tun kann (warten, bis die Jagd vorbei ist).
--
-- Der Bedingungsname ist gemessen, nicht geglaubt (31.07.2026):
--   raise exception 'probe' using errcode = 'object_in_use';  -->  SQLSTATE 55006
--
-- ZWEI Dinge, die man dazu wissen muss:
--
-- 1. Es ist der ERSTE fachliche Absage-Code des Projekts. Bis heute wirft jede
--    SECURITY-DEFINER-Funktion ausschließlich `insufficient_privilege`
--    (nachgezählt über pg_proc). Wer als nächster eine fachliche Absage
--    braucht, sollte sich an dieser Stelle orientieren statt 42501
--    zweckzuentfremden — „Du darfst nicht" für „geht gerade nicht" ist eine
--    Auskunft, die schlicht falsch ist.
-- 2. PostgREST bildet die Fehlerklasse 55 auf **HTTP 500** ab. Auch das ist
--    gemessen, nicht angenommen — mit einer Wegwerf-Funktion gegen die echte
--    Produktions-URL (31.07.2026, danach sofort entfernt):
--
--      POST /rest/v1/rpc/<sonde 55006>  ->  500  {"code":"55006", …}
--      POST /rest/v1/rpc/<sonde 42501>  ->  401  {"code":"42501", …}
--
--    **Entscheidend ist der Körper, nicht der Status:** er kommt durch das
--    Gateway unverändert an, und `postgrest-js` parst bei JEDER nicht-ok-
--    Antwort den ganzen Körper nach `error` (`error = JSON.parse(body)`).
--    `error.code === '55006'` hält also, und daran hängen
--    `isStandOccupiedError` und die Meldung im Client.
--
--    Der Preis ist allein kosmetisch: ein ganz normaler Nutzervorgang taucht
--    im Server-Log als 500 auf. Bewusst in Kauf genommen — der sprechende Code
--    ist mehr wert als ein sauberer Status. Wird daraus je Alarm-Rauschen, ist
--    `PT409` der Tausch (Status 409, `error.code` dann 'PT409').
--
-- Idempotent: reines CREATE OR REPLACE, kein DDL an Tabellen. Bestehende
-- Grants bleiben erhalten.

-- Die Regel steht EINMAL, weil sie an drei Stellen gebraucht wird: vorab, im
-- WHERE des UPDATE und noch einmal beim Deuten eines Fehlschlags. Dreimal
-- abgeschrieben wäre sie dreimal zu pflegen — und genau so entsteht eine
-- Sicherheitsregel, die an einer von drei Stellen anders lautet.
--
-- SECURITY DEFINER, weil sie über `hunt_stand_bezug` liest, wo RLS jedem nur
-- die eigene Zeile zeigt (062, L9): als Aufrufer sähe man fremde Bezüge nicht
-- und hielte einen belegten Stand für frei — ein falsch-negativer Riegel, also
-- die gefährliche Richtung.
--
-- Kein GRANT, dafür REVOKE: die Funktion ist ausschließlich Innenteil von
-- `kartenobjekt_loeschen`. Dieselbe Begründung wie bei
-- `clear_stand_bezug_on_drive_end` in 062 — wer sie direkt aufrufen dürfte,
-- könnte sie als Orakel benutzen („sitzt an Stand X gerade jemand?") und
-- bekäme damit genau die Aufenthaltsangabe, die die Policies verbergen.
CREATE OR REPLACE FUNCTION public.stand_ist_belegt(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  select exists (
    select 1
      from hunt_stand_bezug b
      join hunts h on h.id = b.hunt_id
     where h.status in ('active', 'paused')
       and ( b.map_object_id = p_id
             or b.seat_assignment_id in (
                  select a.id from hunt_seat_assignments a where a.seat_id = p_id
                ) )
  );
$function$;

-- ACHTUNG: `FROM PUBLIC` allein genügt NICHT, und das ist beim Nachmessen nach
-- dem Apply aufgeflogen (31.07.2026). Supabase vergibt EXECUTE auf neue
-- Funktionen zusätzlich EXPLIZIT an anon, authenticated und service_role
-- (`ALTER DEFAULT PRIVILEGES`). Ein Entzug von PUBLIC räumt den PUBLIC-Eintrag
-- ab und lässt die drei Rollen unberührt — gemessen: anon=true, authed=true.
--
-- Die Rollen müssen also NAMENTLICH genannt werden. Gegenprobe danach
-- (`proacl` muss auf `postgres=X/postgres` zusammenschrumpfen):
--
--   select has_function_privilege('authenticated', p.oid, 'EXECUTE')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = '<name>';
--
-- Dieselbe Lücke steht projektweit in zehn weiteren SECURITY-DEFINER-
-- Funktionen, darunter `clear_stand_bezug_on_drive_end` aus 062, deren Kopf
-- den Entzug ausführlich begründet. Eigener Befund, eigene Migration —
-- s. Backlog.
REVOKE ALL ON FUNCTION public.stand_ist_belegt(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kartenobjekt_loeschen(p_id uuid, p_district_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
begin
  -- 1. Recht — vor allem anderen, s. Kopf.
  if not kann_kartenobjekt_verwalten(p_id) then
    raise exception 'Objekt nicht gefunden oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;

  -- 2. Die Zeile selbst: richtiges Revier, noch nicht geworfen. VOR der
  --    Belegung, sonst verdeckt 55006 einen Grund, der ohnehin greift.
  --
  --    `is not distinct from` statt `=`, damit ein Ad-hoc-Objekt (district_id
  --    null) mit p_district_id => null ansprechbar bleibt; mit `=` wäre jeder
  --    Vergleich gegen null unbekannt und die Zeile für immer unlöschbar.
  if not exists (
    select 1 from map_objects o
     where o.id = p_id
       and o.district_id is not distinct from p_district_id
       and o.deleted_at is null
  ) then
    raise exception 'Objekt nicht gefunden oder keine Berechtigung'
      using errcode = 'insufficient_privilege';
  end if;

  -- 3. Belegung.
  if stand_ist_belegt(p_id) then
    raise exception 'Am Stand ist jemand eingelockt, solange die Jagd läuft'
      using errcode = 'object_in_use';
  end if;

  -- 4. Schreiben. Alle Bedingungen NOCH EINMAL, weil diese Anweisung ihren
  --    eigenen, frischeren Snapshot hat: ein Einlocken, das nach Schritt 3
  --    committet hat, trifft hier auf `not stand_ist_belegt` und lässt das
  --    UPDATE ins Leere laufen.
  update map_objects o
     set deleted_at = now()
   where o.id = p_id
     and o.district_id is not distinct from p_district_id
     and o.deleted_at is null
     and kann_kartenobjekt_verwalten(p_id)
     and not stand_ist_belegt(p_id);

  -- Nach den Schritten 1–3 bleibt für einen Fehlschlag praktisch nur das
  -- Wettrennen. Trotzdem beide Zweige, und jeder sagt etwas Wahres: ein
  -- gleichzeitig entzogenes Recht soll nicht als „da sitzt jemand" erscheinen.
  if not found then
    if stand_ist_belegt(p_id) then
      raise exception 'Am Stand ist jemand eingelockt, solange die Jagd läuft'
        using errcode = 'object_in_use';
    else
      raise exception 'Objekt nicht gefunden oder keine Berechtigung'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
end;
$function$;
