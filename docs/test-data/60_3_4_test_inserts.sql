-- ============================================================
-- Sprint 60.3.4 — Test-Daten für AnblickCard + GesellCard
-- ============================================================
-- Zweck: Deterministische Test-Items für die visuelle Verifikation von
-- AnblickCard und GesellCard auf der echten Cloud-DB, bevor die
-- Eingabe-UI für Anblicke (späterer Sprint) existiert.
--
-- Ausführungsort: Supabase SQL Editor (Projekt bzfevyqfkizmovoclysy).
-- Idempotent: das File darf mehrfach laufen — alle INSERTs sind durch
--             Marker-basierte WHERE-NOT-EXISTS-Guards / ON-CONFLICT-DO-NOTHING
--             gegen Vervielfachung gesichert.
-- Cleanup: am Ende auskommentierter DELETE-Block. Reihenfolge beachten,
--          weil kills.hunt_id ohne ON-DELETE-Cascade ist.
--
-- Marker-Konvention:
--   wild_events.note  LIKE '%[TEST 60.3.4]%'
--   hunts.notiz       LIKE '%[TEST 60.3.4]%'
--   kills.notiz       LIKE '%[TEST 60.3.4]%'
-- Sub-Marker /A1, /A2, /B*, /C* unterscheiden Szenarien für gezielte
-- Idempotenz-Checks und für detaillierten Cleanup falls je nötig.
-- ============================================================

-- ============================================================
-- Schema-Recon (Stand 2026-05-08, Migrations bis 036 inklusive)
-- ============================================================
-- hunts (relevante Spalten):
--   creator_id            uuid NOT NULL  -> profiles(id)        (003)
--   name                  text NOT NULL                         (003)
--   invite_code           text NOT NULL UNIQUE                  (003)
--   type                  hunt_type DEFAULT 'ansitz'            (003)
--   status                hunt_status DEFAULT 'draft'           (003)
--   started_at, ended_at  timestamptz NULL                      (003)
--   kind                  hunt_kind NOT NULL DEFAULT 'group'    (029)
--   last_activity_at      timestamptz NOT NULL DEFAULT now()    (029)
--   notiz                 text NULL                             (036) — Marker hier
--   share_total_strecke   boolean NOT NULL DEFAULT false        (036)
--   boundary              geography(Polygon,4326) NULL          (026, hier NULL)
-- → hunt_type-Enum kennt KEIN 'gesell'. GesellCard wird über
--   hunt_participants.count >= 2 detektiert (timeline.ts:244),
--   nicht über hunts.kind. type='drueckjagd' ist semantisch korrekt.
--
-- hunt_participants (relevante Spalten):
--   hunt_id      uuid NOT NULL ON DELETE CASCADE
--   user_id      uuid NULL  (CHECK: user_id OR guest_name)
--   guest_name   text NULL
--   role         participant_role DEFAULT 'schuetze'  ('jagdleiter'|'schuetze')
--   status       participant_status DEFAULT 'invited'  ('invited'|'joined'|'left')
--   UNIQUE (hunt_id, user_id) — ON CONFLICT-tauglich für User-Rows;
--                               für Guest-Rows greift NULLs-distinct,
--                               daher dort WHERE-NOT-EXISTS gegen guest_name.
--
-- wild_events (Migration 036):
--   user_id     uuid NOT NULL -> auth.users(id)
--   type        wild_event_type NOT NULL  ('sighting'|'shot'|'kill'|'miss'|'wounded'|'fallwild')
--   occurred_at timestamptz NOT NULL
--   hunt_id     uuid NULL -> hunts(id) ON DELETE SET NULL
--   species     text NULL  (FREITEXT bei sighting/shot, gespiegelt aus kills.wild_art bei type=kill)
--   count       integer DEFAULT 1 CHECK >= 1
--   note        text NULL  — Marker hier
--   location    geography(Point,4326) NULL  (hier NULL)
--   created_at  timestamptz DEFAULT now()
--
-- kills (relevante Spalten):
--   reporter_id     uuid NOT NULL -> profiles(id)
--   wild_art        wild_art NOT NULL
--   hunt_id         uuid NULL -> hunts(id)  (KEINE ON-DELETE-Cascade → kills VOR hunts löschen!)
--   geschlecht      geschlecht NULL  (NULL erlaubt seit 027)
--   gewicht_kg      float NULL
--   distance_m      integer NULL CHECK >= 0       (036)
--   weather_snapshot jsonb NULL                   (036)
--   notiz           text NULL                      (034) — Marker hier
--   wild_event_id   uuid NULL -> wild_events(id) ON DELETE SET NULL  (036)
--   nachsuche       boolean DEFAULT false
--   erlegt_am       timestamptz DEFAULT now()
--
-- KEIN Auto-Trigger für kills→wild_events: Migration 036 macht
-- ein einmaliges Backfill-INSERT, aber neue Kills (via insertKill.ts
-- oder hier per Hand) erzeugen KEINE wild_events-Row. Daher fügen
-- wir für jeden Test-Kill explizit eine wild_events-Row + Link ein,
-- damit getDiaryStats.erlegungen konsistent zählt.
-- ============================================================

BEGIN;

-- ============================================================
-- SZENARIO A — Solo-Anblick ohne Hunt
-- → AnblickCard mit huntId=NULL, AnblickList "3× Rehwild · 1× Fuchs"
--   (Mockup Card B-Pattern, ohne Hunt-Kontext).
-- → Sichtbar im aktuellen Jagdjahr 2026/27 (NOW() - 14 Tage = 2026-04-24).
-- ============================================================

INSERT INTO wild_events (user_id, type, hunt_id, species, count, occurred_at, note)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'sighting',
  NULL,
  'rehwild',
  3,
  NOW() - interval '14 days',
  'Test-Anblick Solo, Rehwild [TEST 60.3.4 / A1]'
WHERE NOT EXISTS (
  SELECT 1 FROM wild_events WHERE note LIKE '%[TEST 60.3.4 / A1]%'
);

INSERT INTO wild_events (user_id, type, hunt_id, species, count, occurred_at, note)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'sighting',
  NULL,
  'fuchs',
  1,
  NOW() - interval '14 days',
  'Test-Anblick Solo, Fuchs [TEST 60.3.4 / A2]'
WHERE NOT EXISTS (
  SELECT 1 FROM wild_events WHERE note LIKE '%[TEST 60.3.4 / A2]%'
);

-- ============================================================
-- SZENARIO B — Drückjagd mit Gesamtstrecke freigegeben
-- → GesellCard unlocked: deinAnteil + gesamtStrecke gerendert
-- → Drei Kills: 2× von Moritz, 1× von einem anderen Profile
--   (falls vorhanden — sonst Fallback auf Moritz).
-- → Datum: NOW() - 120 Tage = 2026-01-08, also Jagdjahr 2025/26.
--   Moritz muss im SeasonPicker zurückblättern, um die Card zu sehen.
-- ============================================================

-- B.1: Hunt
INSERT INTO hunts (
  creator_id, name, type, kind, status,
  invite_code, share_total_strecke, notiz,
  started_at, ended_at
)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'Drückjagd Brockwinkel',
  'drueckjagd',
  'group',
  'completed',
  'TST60341',
  TRUE,
  'Test-Drückjagd Brockwinkel [TEST 60.3.4 / B]',
  NOW() - interval '120 days',
  NOW() - interval '120 days' + interval '5 hours'
WHERE NOT EXISTS (
  SELECT 1 FROM hunts WHERE notiz LIKE '%[TEST 60.3.4 / B]%'
);

-- B.2: Hunt-Participants (≥2 → Card aggregiert als 'gesell')
-- Moritz als Jagdleiter
INSERT INTO hunt_participants (hunt_id, user_id, role, status, joined_at)
SELECT
  h.id,
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'jagdleiter',
  'joined',
  h.started_at
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
ON CONFLICT (hunt_id, user_id) DO NOTHING;

-- Test-Gast als zweiter Teilnehmer (UNIQUE-Constraint greift bei NULL user_id nicht,
-- daher manueller WHERE-NOT-EXISTS-Guard auf guest_name)
INSERT INTO hunt_participants (hunt_id, guest_name, role, status, joined_at)
SELECT
  h.id,
  'Test-Gast 60.3.4',
  'schuetze',
  'joined',
  h.started_at
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM hunt_participants p
    WHERE p.hunt_id = h.id AND p.guest_name = 'Test-Gast 60.3.4'
  );

-- B.3: Kills + symmetrische wild_events-Rows.
-- Pattern für jeden Kill: (a) wild_events row anlegen,
--                         (b) kills row anlegen mit wild_event_id-Verknüpfung
-- via JOIN auf den note-Sub-Marker. Beide Statements einzeln idempotent.

-- B.3.frischling — Reporter: Moritz
INSERT INTO wild_events (user_id, hunt_id, type, species, occurred_at, note)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  h.id,
  'kill',
  'frischling',
  h.started_at + interval '2 hours',
  'Test-Kill Frischling [TEST 60.3.4 / B-frischling]'
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM wild_events WHERE note LIKE '%[TEST 60.3.4 / B-frischling]%'
  );

INSERT INTO kills (
  reporter_id, hunt_id, wild_art, gewicht_kg, distance_m,
  erlegt_am, notiz, wild_event_id
)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  h.id,
  'frischling',
  22,
  35,
  e.occurred_at,
  'Frischling auf Treiben 1 [TEST 60.3.4 / B-frischling]',
  e.id
FROM hunts h
JOIN wild_events e
  ON e.hunt_id = h.id
  AND e.note LIKE '%[TEST 60.3.4 / B-frischling]%'
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM kills WHERE notiz LIKE '%[TEST 60.3.4 / B-frischling]%'
  );

-- B.3.bache — Reporter: anderes Profile (falls vorhanden), sonst Moritz.
-- Differenz Moritz vs Other erzeugt deinAnteil != gesamtStrecke (lehrreicher Test).
-- nachsuche=true → GesellCard-Footer zeigt "1 Nachsuche".
INSERT INTO wild_events (user_id, hunt_id, type, species, occurred_at, note)
SELECT
  COALESCE(
    (SELECT id FROM profiles
       WHERE id <> '7e88910e-1ca8-4868-9313-6c5207406d23'
       ORDER BY created_at LIMIT 1),
    '7e88910e-1ca8-4868-9313-6c5207406d23'
  ),
  h.id,
  'kill',
  'bache',
  h.started_at + interval '3 hours',
  'Test-Kill Bache (Nachsuche) [TEST 60.3.4 / B-bache]'
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM wild_events WHERE note LIKE '%[TEST 60.3.4 / B-bache]%'
  );

INSERT INTO kills (
  reporter_id, hunt_id, wild_art, gewicht_kg, distance_m,
  erlegt_am, notiz, nachsuche, wild_event_id
)
SELECT
  e.user_id,
  h.id,
  'bache',
  68,
  120,
  e.occurred_at,
  'Bache, krankgeschossen, Hund nachgesucht [TEST 60.3.4 / B-bache]',
  TRUE,
  e.id
FROM hunts h
JOIN wild_events e
  ON e.hunt_id = h.id
  AND e.note LIKE '%[TEST 60.3.4 / B-bache]%'
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM kills WHERE notiz LIKE '%[TEST 60.3.4 / B-bache]%'
  );

-- B.3.rehbock — Reporter: Moritz
INSERT INTO wild_events (user_id, hunt_id, type, species, occurred_at, note)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  h.id,
  'kill',
  'rehbock',
  h.started_at + interval '4 hours',
  'Test-Kill Rehbock [TEST 60.3.4 / B-rehbock]'
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM wild_events WHERE note LIKE '%[TEST 60.3.4 / B-rehbock]%'
  );

INSERT INTO kills (
  reporter_id, hunt_id, wild_art, gewicht_kg, distance_m,
  erlegt_am, notiz, wild_event_id
)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  h.id,
  'rehbock',
  17,
  60,
  e.occurred_at,
  'Rehbock am Bestandsrand [TEST 60.3.4 / B-rehbock]',
  e.id
FROM hunts h
JOIN wild_events e
  ON e.hunt_id = h.id
  AND e.note LIKE '%[TEST 60.3.4 / B-rehbock]%'
WHERE h.notiz LIKE '%[TEST 60.3.4 / B]%'
  AND NOT EXISTS (
    SELECT 1 FROM kills WHERE notiz LIKE '%[TEST 60.3.4 / B-rehbock]%'
  );

-- ============================================================
-- SZENARIO C — Hunt mit 0 Erlegungen + 1 Anblick
-- → Soll später als AnblickCard mit Hunt-Kontext + "ohne Strecke"
--   rendern (Mockup Card B mit Hunt-Container).
-- → ⚠ Sichtbar wird das ERST ab Phase 2.3, wenn timeline.ts einen
--   kind:'anblick'-Branch bekommt — aktuell aggregiert es nur Kills,
--   keine Sightings.
-- → Datum: NOW() - 7 Tage = 2026-05-01, Jagdjahr 2026/27 (aktuell).
-- ============================================================

-- C.1: Hunt
INSERT INTO hunts (
  creator_id, name, type, kind, status,
  invite_code, share_total_strecke, notiz,
  started_at, ended_at
)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'Morgenansitz Nordkante',
  'ansitz',
  'solo',
  'completed',
  'TST60342',
  FALSE,
  'Test-Morgenansitz Nordkante [TEST 60.3.4 / C]',
  NOW() - interval '7 days',
  NOW() - interval '7 days' + interval '2 hours'
WHERE NOT EXISTS (
  SELECT 1 FROM hunts WHERE notiz LIKE '%[TEST 60.3.4 / C]%'
);

-- C.2: Moritz als Teilnehmer (damit Hunt in seiner participationHuntIds-Set
--      landet — sonst sieht timeline.ts den 0-Kill-Hunt gar nicht).
INSERT INTO hunt_participants (hunt_id, user_id, role, status, joined_at)
SELECT
  h.id,
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'jagdleiter',
  'joined',
  h.started_at
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / C]%'
ON CONFLICT (hunt_id, user_id) DO NOTHING;

-- C.3: Sighting (Anblick) auf diesen Hunt
INSERT INTO wild_events (user_id, type, hunt_id, species, count, occurred_at, note)
SELECT
  '7e88910e-1ca8-4868-9313-6c5207406d23',
  'sighting',
  h.id,
  'rehwild',
  2,
  h.started_at + interval '90 minutes',
  'Bock noch zu jung [TEST 60.3.4 / C-event]'
FROM hunts h
WHERE h.notiz LIKE '%[TEST 60.3.4 / C]%'
  AND NOT EXISTS (
    SELECT 1 FROM wild_events WHERE note LIKE '%[TEST 60.3.4 / C-event]%'
  );

COMMIT;

-- ============================================================
-- POST-INSERT-VERIFIKATION (manuell ausführen, nicht idempotent)
-- ============================================================
-- Erwartete Zeilen-Counts nach erstem Lauf:
--   wild_events mit Marker: 6  (A1, A2, B-frischling, B-bache, B-rehbock, C-event)
--   hunts mit Marker:       2  (B, C)
--   hunt_participants Test: 3  (Moritz×B, Gast×B, Moritz×C)
--   kills mit Marker:       3  (B-frischling, B-bache, B-rehbock)
--   getDiaryStats.erlegungen Δ: +3 für Moritz im Jagdjahr 2025/26
--                               (B liegt in 2025/26 wegen 120-Tage-Datum)
--
-- SELECT
--   (SELECT count(*) FROM wild_events WHERE note LIKE '%[TEST 60.3.4]%') AS we_count,
--   (SELECT count(*) FROM hunts       WHERE notiz LIKE '%[TEST 60.3.4]%') AS hunts_count,
--   (SELECT count(*) FROM hunt_participants p
--      JOIN hunts h ON h.id = p.hunt_id
--      WHERE h.notiz LIKE '%[TEST 60.3.4]%')                              AS hp_count,
--   (SELECT count(*) FROM kills       WHERE notiz LIKE '%[TEST 60.3.4]%') AS kills_count;

-- ============================================================
-- CLEANUP — auskommentiert, manuell aktivieren bei Bedarf
-- ============================================================
-- Reihenfolge zwingend: kills → wild_events → hunts.
-- Grund: kills.hunt_id hat KEIN ON DELETE CASCADE (FK-Restrict).
--        hunt_participants.hunt_id hat ON DELETE CASCADE (kein expliziter Step nötig).
--        wild_events.hunt_id hat ON DELETE SET NULL — explizit löschen für saubere Rückkehr.
--
-- BEGIN;
--   DELETE FROM kills       WHERE notiz LIKE '%[TEST 60.3.4]%';
--   DELETE FROM wild_events WHERE note  LIKE '%[TEST 60.3.4]%';
--   DELETE FROM hunts       WHERE notiz LIKE '%[TEST 60.3.4]%';
-- COMMIT;
