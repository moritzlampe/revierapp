-- 054_map_objects_fk_set_null.sql
-- Löschen eines map_object (z.B. Hochsitz) scheiterte mit FK-Constraint
-- (ERROR 23503), weil fünf Referenzen NO ACTION waren. Diese auf
-- ON DELETE SET NULL umstellen, damit Historie beim Löschen erhalten bleibt:
-- Erlegungen (kills), Nachsuchen (tracking_requests), Teilnahme-Stand
-- (hunt_participants), Drückjagd-Stände (driven_hunt_stands) und
-- Sitz-Zuweisungen (hunt_seat_assignments) bleiben bestehen, verlieren nur
-- den Hochsitz-Bezug.
--
-- kills bewusst SET NULL statt CASCADE: ein Streckenbuch-Eintrag hat
-- rechtliches Gewicht und darf NIEMALS mitgelöscht werden.
--
-- Alle fünf Spalten sind nullable -> kein ALTER COLUMN nötig.
-- Alle fünf FKs sind plain `references map_objects(id)` ohne ON UPDATE
-- (003_quickhunt_schema.sql:204/283/324/464, 013_hunt_seat_assignments.sql:12),
-- daher wird nur die ON-DELETE-Klausel ergänzt.
-- map_object_photos.map_object_id bleibt CASCADE (025): Fotos ohne Objekt
-- sind Müll, hier ist Mitlöschen korrekt.

BEGIN;

-- hunt_participants.stand_id (zugewiesener Stand eines Teilnehmers)
ALTER TABLE hunt_participants
  DROP CONSTRAINT IF EXISTS hunt_participants_stand_id_fkey;
ALTER TABLE hunt_participants
  ADD CONSTRAINT hunt_participants_stand_id_fkey
  FOREIGN KEY (stand_id) REFERENCES map_objects(id) ON DELETE SET NULL;

-- kills.hochsitz_id (Streckenbuch-Eintrag — NIEMALS CASCADE)
ALTER TABLE kills
  DROP CONSTRAINT IF EXISTS kills_hochsitz_id_fkey;
ALTER TABLE kills
  ADD CONSTRAINT kills_hochsitz_id_fkey
  FOREIGN KEY (hochsitz_id) REFERENCES map_objects(id) ON DELETE SET NULL;

-- tracking_requests.hochsitz_id (Nachsuche-Meldung)
ALTER TABLE tracking_requests
  DROP CONSTRAINT IF EXISTS tracking_requests_hochsitz_id_fkey;
ALTER TABLE tracking_requests
  ADD CONSTRAINT tracking_requests_hochsitz_id_fkey
  FOREIGN KEY (hochsitz_id) REFERENCES map_objects(id) ON DELETE SET NULL;

-- driven_hunt_stands.map_object_id (Drückjagd-Stand, Verweis auf permanenten Hochsitz)
ALTER TABLE driven_hunt_stands
  DROP CONSTRAINT IF EXISTS driven_hunt_stands_map_object_id_fkey;
ALTER TABLE driven_hunt_stands
  ADD CONSTRAINT driven_hunt_stands_map_object_id_fkey
  FOREIGN KEY (map_object_id) REFERENCES map_objects(id) ON DELETE SET NULL;

-- hunt_seat_assignments.seat_id (Sitzplan einer Jagd; NULL = Freier Stand)
ALTER TABLE hunt_seat_assignments
  DROP CONSTRAINT IF EXISTS hunt_seat_assignments_seat_id_fkey;
ALTER TABLE hunt_seat_assignments
  ADD CONSTRAINT hunt_seat_assignments_seat_id_fkey
  FOREIGN KEY (seat_id) REFERENCES map_objects(id) ON DELETE SET NULL;

COMMIT;
