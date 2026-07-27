-- 062_stand_bezug.sql
--
-- Standbezug („Einlocken"): wer steht gerade an welchem Stand.
--
-- Konzept: quickhunt-native/docs/konzepte/QuickHunt_Konzept_Standbezug_V1.md
-- (GELOCKT 27.07.2026, außer L10). Etappe B1.
--
-- Kernsatz des Konzepts: „Bezug ist eine Aussage über eine Person, nicht über
-- einen Platz." Bis 061 war Belegung eine reine Client-Rechnung: JEDES Gerät
-- rechnete alle Stände gegen alle fremden Positionen (stand-occupancy.ts). Das
-- hatte drei Löcher, die diese Tabelle mit derselben Umkehrung schließt —
-- jeder schreibt nur seine EIGENE Zeile:
--   1. Consent: wer position_consent='none' wählt, schreibt keine Position,
--      konnte also von keinem fremden Gerät je als bezogen erkannt werden.
--   2. Genauigkeit: upsertCurrentPosition verwirft jeden Fix mit accuracy >= 10 m
--      (positions.ts:45). Unter Nadelholz im Dezember ist das der Normalfall —
--      für fremde Geräte existiert so ein Schütze nicht. Sein eigenes Gerät
--      kennt ihn trotzdem (tracking.ts:139).
--   3. Keine gemeinsame Wahrheit: zwei Geräte mit unterschiedlichem
--      Realtime-Stand rechneten unterschiedliche Belegungen. Bei einem
--      Sicherheitssignal nicht akzeptabel.
--
-- Design-Locks (Konzept §10):
--   L1  Eine Zeile pro TEILNEHMER, nicht pro Stand — deshalb ist
--       participant_id der Primary Key. Ein Mensch steht an genau einem Stand;
--       der Zustand des Stands wird daraus abgeleitet. „Frei" ist keine Zeile.
--   L8  GPS-Bezug nur bei consent <> 'none'; manueller Bezug unter jedem
--       Consent. Der Client entscheidet es, die DB erzwingt es (WITH CHECK,
--       Abschnitt 3): ein Upsert, der vor dem Widerruf losflog, kann danach
--       committen — dieses Rennen ist im Client nicht zu gewinnen.
--   L9  Kein Fremd-Auschecken durch den Jagdleiter: die Write-Policy erlaubt
--       ausschließlich die eigene Zeile. Eine Selbstauskunft, die ein anderer
--       abgeben kann, ist keine. Der Aufräum-Trigger (Abschnitt 4) ist kein
--       Gegenbeispiel: er räumt beim Treiben-Ende auf, er gibt keine Auskunft ab.
--
-- NAMENSFALLE, hart dokumentiert: positions_current.is_locked heißt NICHT
-- „eingelockt", sondern „GPS-Fix genauer als 10 m" (positions.ts:13,62,90).
-- Der Name is_locked darf für den Standbezug nie wiederverwendet werden.
-- Ebenso ist hunt_participants.stand_id PWA-Altlast (durch
-- hunt_seat_assignments abgelöst, nativ ungenutzt) und wird hier nicht angefasst.
--
-- Idempotent. Im Supabase SQL Editor in EINER Selektion ausführen.

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------
--
-- map_object_id / seat_assignment_id sind exklusiv — dasselbe Muster wie
-- hunt_drive_stands (056): ein fester Stand IST seine map_objects.id, ein
-- Ad-hoc-Sitz IST seine hunt_seat_assignments.id. Beide kollabieren in den
-- EINEN Schlüsselraum, den die Karte ohnehin benutzt (assignment.ts:19).
-- Ein einzelnes stand_id uuid ginge nicht: es könnte auf keine der beiden
-- Tabellen einen FK tragen, und ein gelöschter Stand ließe eine Waise zurück.

CREATE TABLE IF NOT EXISTS public.hunt_stand_bezug (
  participant_id     uuid PRIMARY KEY
                       REFERENCES public.hunt_participants(id) ON DELETE CASCADE,
  hunt_id            uuid NOT NULL
                       REFERENCES public.hunts(id) ON DELETE CASCADE,
  map_object_id      uuid REFERENCES public.map_objects(id) ON DELETE CASCADE,
  seat_assignment_id uuid REFERENCES public.hunt_seat_assignments(id) ON DELETE CASCADE,
  source             text NOT NULL CHECK (source IN ('gps', 'manual')),
  since              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunt_stand_bezug_one_stand
    CHECK (num_nonnulls(map_object_id, seat_assignment_id) = 1)
);

-- ON DELETE CASCADE statt SET NULL auf beiden Stand-Spalten: ein Bezug ohne
-- Stand ist kein Zustand, sondern Datenmüll — und der CHECK oben würde ihn
-- ohnehin verbieten. Anders als bei hunt_drive_stands (061, SET NULL) gibt es
-- hier nichts, was den Wegfall überleben sollte.

-- ---------------------------------------------------------------------------
-- 2. Index
-- ---------------------------------------------------------------------------
--
-- Jeder Lesezugriff geht über die Jagd: der Initial-Fetch (WHERE hunt_id = …)
-- und der Realtime-Filter. participant_id deckt der Primary Key ab.

CREATE INDEX IF NOT EXISTS hunt_stand_bezug_hunt_idx
  ON public.hunt_stand_bezug (hunt_id);

-- ponytail: kein Index auf map_object_id/seat_assignment_id. Die Ableitung
-- „Zustand eines Stands" passiert im Client auf den ohnehin geladenen Zeilen
-- einer Jagd — eine Handvoll pro Jagd. Ein Index dafür wäre Zierde.

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
--
-- Beide Policies sind 1:1 die von positions_current — bewusst, denn es ist
-- dieselbe Vertraulichkeitsklasse (grobe Aufenthaltsangabe innerhalb einer
-- Jagd, sichtbar für die Mitjäger).

ALTER TABLE public.hunt_stand_bezug ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stand_bezug_hunt_member ON public.hunt_stand_bezug;
CREATE POLICY stand_bezug_hunt_member
  ON public.hunt_stand_bezug
  FOR SELECT
  USING (hunt_id IN (SELECT get_my_joined_hunt_ids()));

-- EINE Policy deckt Insert, Update und Delete der eigenen Zeile ab (L9).
--
-- Anders als positions_current bindet die Bedingung participant_id UND hunt_id
-- an DIESELBE Teilnehmerzeile. Ohne diese Kopplung wäre die Policy zu weit:
-- wer in Jagd A und Jagd B joined ist, könnte eine Zeile mit seinem
-- participant_id aus A und hunt_id = B schreiben. Beide Fremdschlüssel wären
-- einzeln gültig, die Policy zufrieden — und die Teilnehmer von B bekämen per
-- Realtime (Filter hunt_id) den Bezug einer Person geliefert, die gar nicht zu
-- ihrer Jagd gehört. Bei einem Sicherheitssignal ist ein fälschlich besetzter
-- Stand keine Kosmetik.
-- USING und WITH CHECK sind hier bewusst NICHT identisch. USING regelt, welche
-- Zeilen man sieht, ändert und löscht; WITH CHECK, welche man hinterlassen darf.
-- Nur im WITH CHECK steht zusätzlich die Consent-Bedingung aus L8: ein
-- GPS-Bezug darf nicht entstehen, wenn der Teilnehmer 'none' gewählt hat.
-- Stünde sie auch im USING, ließe sich eine bereits vorhandene GPS-Zeile nach
-- dem Widerruf nicht mehr löschen — also genau das, was der Widerruf tun muss.
--
-- Warum überhaupt serverseitig: der Client kann dieses Rennen nicht gewinnen.
-- Ein GPS-Upsert, der vor dem Widerruf losgeschickt wurde, committet
-- gegebenenfalls danach und legte die Zeile wieder an. Hier scheitert er.
DROP POLICY IF EXISTS stand_bezug_own ON public.hunt_stand_bezug;
CREATE POLICY stand_bezug_own
  ON public.hunt_stand_bezug
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.hunt_participants p
      WHERE p.id = hunt_stand_bezug.participant_id
        AND p.hunt_id = hunt_stand_bezug.hunt_id
        AND p.user_id = auth.uid()
        AND p.status = 'joined'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hunt_participants p
      WHERE p.id = hunt_stand_bezug.participant_id
        AND p.hunt_id = hunt_stand_bezug.hunt_id
        AND p.user_id = auth.uid()
        AND p.status = 'joined'
        AND (source <> 'gps' OR p.position_consent IS DISTINCT FROM 'none')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Aufräumen beim Treiben-Ende
-- ---------------------------------------------------------------------------
--
-- Konzept §6: „Treiben-Ende räumt jeden Bezug an den Ständen dieses Treibens
-- ab." Das gehört in die DB und nicht in die Clients — aus drei Gründen, die
-- ein Client-Effekt einzeln nicht lösen kann:
--
--   1. Wer die Kante verschläft (App im Hintergrund), räumt nie auf. Genau das
--      trifft den manuell Eingelockten ohne GPS, für den es das Aufräumen
--      überhaupt gibt: ihn holt sonst auch kein Geofence heraus.
--   2. `reopen_drive` setzt ended_at wieder auf NULL. Ein Client, der nur den
--      aktuellen Snapshot sieht, kann ein zwischenzeitliches Ende danach nicht
--      mehr erkennen — der Beweis ist weg.
--   3. Ein Vergleich clientgesetzter Zeitstempel (bezug.since gegen
--      drives.ended_at) hängt an zwei verschiedenen Handy-Uhren. Hier entscheidet
--      eine Uhr, und zwar gar keine: die Kante selbst ist das Ereignis.
--
-- SECURITY DEFINER, weil der Trigger fremde Bezugszeilen löscht — RLS erlaubt
-- jedem nur die eigene (L9). Das ist kein Widerspruch: L9 regelt, wer eine
-- Selbstauskunft ABGEBEN darf, nicht wie das System nach dem Treiben aufräumt.
-- search_path fest verdrahtet, damit die Funktion nicht über einen
-- untergeschobenen Schemapfad angreifbar ist.

CREATE OR REPLACE FUNCTION public.clear_stand_bezug_on_drive_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.hunt_stand_bezug b
  WHERE b.hunt_id = NEW.hunt_id
    AND EXISTS (
      SELECT 1 FROM public.hunt_drive_stands s
      WHERE s.drive_id = NEW.id
        AND (
          (s.map_object_id IS NOT NULL AND s.map_object_id = b.map_object_id)
          OR (s.seat_assignment_id IS NOT NULL AND s.seat_assignment_id = b.seat_assignment_id)
        )
    );
  RETURN NEW;
END;
$$;

-- Ohne diesen Entzug wäre die Funktion eine offene Tür: neue Funktionen tragen
-- standardmäßig EXECUTE für PUBLIC, und wer sie ausführen darf, darf sie auch
-- an eine EIGENE (etwa temporäre) Tabelle als Trigger hängen und NEW.id /
-- NEW.hunt_id frei bestimmen. Sie liefe dann als Eigentümer und löschte fremde
-- Bezugszeilen, die der Aufrufer nach L9 nie anfassen dürfte.
-- Es folgt KEIN GRANT: anders als set_position_consent (059) ruft diese
-- Funktion niemand direkt auf — der Trigger braucht dafür kein EXECUTE-Recht.
-- CREATE OR REPLACE erhält bestehende Grants, deshalb steht der REVOKE hier
-- fest im File und nicht nur im Kopf des ersten Anwenders.
REVOKE ALL ON FUNCTION public.clear_stand_bezug_on_drive_end() FROM public;

-- DROP vor CREATE: CREATE TRIGGER kennt kein IF NOT EXISTS, und ein Re-Run der
-- Migration darf nicht an einem bestehenden Trigger scheitern (Lehre aus 039).
DROP TRIGGER IF EXISTS trg_clear_stand_bezug_on_drive_end ON public.hunt_drives;
CREATE TRIGGER trg_clear_stand_bezug_on_drive_end
  AFTER UPDATE OF status ON public.hunt_drives
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.clear_stand_bezug_on_drive_end();

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------
--
-- Anders als hunt_drive_stands (061 D5: kein Realtime, weil nur der Jagdleiter
-- schreibt und die Clients die Treiben-Liste ohnehin komplett neu laden) ist
-- der Bezug genau das Gegenteil: viele Schreiber, hohe Frequenz, und die
-- Belegung IST die Information. Ohne Realtime wäre das Sicherheitssignal so
-- alt wie der letzte Reload.
--
-- Replica Identity bleibt Default (Primary Key) wie bei positions_current: das
-- DELETE-Payload trägt damit participant_id, was der Client zum Aufräumen
-- braucht (positions.ts:168 macht es genauso).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hunt_stand_bezug'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hunt_stand_bezug;
  END IF;
END $$;
