-- 036_tagebuch_foundation.sql
-- Foundation-Migration für das Jagdtagebuch (Sprint 60.1)
-- Referenz: Sprint_60_Jagdtagebuch_Konzept_V3.md §4.1
-- Recon: docs/recon/BERICHT_60_0_Tagebuch_Recon.md
-- Stand: 2026-04-30
--
-- Sektionen:
--   A — wild_event_type Enum + wild_events Tabelle (RLS owner-policy)
--   B — kills.wild_event_id FK + Backfill bestehender kills → wild_events
--   C — kills.weather_snapshot, kills.distance_m
--       (kills.notiz existiert bereits seit 034 — NICHT erneut hinzufügen)
--   D — hunts.notiz, hunts.share_total_strecke
--   E — user_settings Tabelle (RLS owner-policy)
--
-- Hinweise:
--   - hunt_photos.kill_ids[] (Migration 030) deckt N:M Foto↔Kill bereits ab,
--     daher KEINE separate kill_photos-Tabelle.
--   - hunts hat bereits Owner-Policy "hunts_creator_all" (003:580). Damit ist
--     share_total_strecke automatisch nur durch Jagdleiter setzbar — keine
--     zusätzliche Policy nötig.

BEGIN;

-- ============================================================
-- A — wild_event_type Enum + wild_events Tabelle
-- ============================================================

CREATE TYPE wild_event_type AS ENUM (
  'sighting',   -- Anblick ohne Schuss
  'shot',       -- Schuss abgegeben (kann mit/ohne Strecke enden)
  'kill',       -- Erlegung erfolgt (verknüpft mit kills.id via kills.wild_event_id)
  'miss',       -- Fehlschuss
  'wounded',    -- krankgeschossen, ggf. Nachsuche
  'fallwild'    -- Fallwild / Wildunfall
);

CREATE TABLE wild_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id      uuid REFERENCES hunts(id) ON DELETE SET NULL,
  type         wild_event_type NOT NULL,
  species      text,
  count        integer DEFAULT 1 CHECK (count >= 1),
  occurred_at  timestamptz NOT NULL,
  location     geography(Point, 4326),
  note         text,
  created_at   timestamptz DEFAULT now()
);

COMMENT ON TABLE wild_events IS
  'Jagdtagebuch-Events des Users (Anblick, Schuss, Erlegung, Fehlschuss, Krankschuss, Fallwild). Owner-only via RLS.';
COMMENT ON COLUMN wild_events.species IS
  'Wildart als Freitext (für sighting/shot ohne kill-Verknüpfung). Bei type=kill wird wild_art aus kills via wild_event_id gespiegelt.';

CREATE INDEX idx_wild_events_user_id     ON wild_events(user_id);
CREATE INDEX idx_wild_events_hunt_id     ON wild_events(hunt_id);
CREATE INDEX idx_wild_events_occurred_at ON wild_events(occurred_at DESC);
CREATE INDEX idx_wild_events_type        ON wild_events(type);

ALTER TABLE wild_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wild_events_owner_all"
  ON wild_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- B — kills.wild_event_id FK + Backfill
-- ============================================================

ALTER TABLE kills
  ADD COLUMN wild_event_id uuid REFERENCES wild_events(id) ON DELETE SET NULL;

CREATE INDEX idx_kills_wild_event_id ON kills(wild_event_id);

-- Pre-Flight: Sicherstellen, dass der Backfill-Match (reporter_id, occurred_at)
-- eindeutig ist. Falls dieser Check fehlschlägt, MUSS der Backfill auf einen
-- Cursor-Loop (mit kill.id pro Iteration) umgestellt werden, BEVOR die
-- Migration erneut angewendet wird.
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT reporter_id, COALESCE(erlegt_am, created_at) AS ts
    FROM kills
    WHERE wild_event_id IS NULL
    GROUP BY reporter_id, COALESCE(erlegt_am, created_at)
    HAVING COUNT(*) > 1
  ) sub;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Backfill abgebrochen: % Reporter+Zeitstempel-Kollisionen in kills. '
      'Sektion B muss auf Cursor-Loop-Variante umgestellt werden, bevor 036 erneut läuft.',
      duplicate_count;
  END IF;
END $$;

-- Backfill in zwei Schritten (idempotent: läuft bei Wiederholung wirkungslos
-- weiter, weil WHERE wild_event_id IS NULL alle bereits verknüpften kills
-- ausfiltert).
WITH inserted AS (
  INSERT INTO wild_events (user_id, hunt_id, type, species, occurred_at, location, created_at)
  SELECT
    reporter_id,
    hunt_id,
    'kill'::wild_event_type,
    wild_art::text,
    COALESCE(erlegt_am, created_at),
    position::geography,
    created_at
  FROM kills
  WHERE wild_event_id IS NULL
  RETURNING id, user_id, occurred_at
)
UPDATE kills k
SET wild_event_id = i.id
FROM inserted i
WHERE k.reporter_id = i.user_id
  AND COALESCE(k.erlegt_am, k.created_at) = i.occurred_at
  AND k.wild_event_id IS NULL;

-- Post-Check: jeder kill muss jetzt eine wild_event-Zuordnung haben.
DO $$
DECLARE
  unmapped_count integer;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM kills WHERE wild_event_id IS NULL;
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION
      'Backfill unvollständig: % kills ohne wild_event_id. Migration wird zurückgerollt.',
      unmapped_count;
  END IF;
END $$;

-- ============================================================
-- C — kills-Erweiterungen (ohne notiz — existiert seit 034!)
-- ============================================================

ALTER TABLE kills
  ADD COLUMN weather_snapshot jsonb;

ALTER TABLE kills
  ADD COLUMN distance_m integer CHECK (distance_m IS NULL OR distance_m >= 0);

COMMENT ON COLUMN kills.weather_snapshot IS
  'Wetter-Snapshot zum Zeitpunkt der Erlegung (OpenMeteo, optional). Schema offen — wird in 60.5 festgeklopft.';
COMMENT ON COLUMN kills.distance_m IS
  'Schussentfernung in Metern (optional, vom Reporter manuell eingetragen).';

-- ============================================================
-- D — hunts-Erweiterungen
-- ============================================================

ALTER TABLE hunts
  ADD COLUMN notiz text;

ALTER TABLE hunts
  ADD COLUMN share_total_strecke boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN hunts.notiz IS
  'Freitextnotiz zur Jagd (Tagebuch-Eintrag der Jagdleitung).';
COMMENT ON COLUMN hunts.share_total_strecke IS
  'Wenn true, darf die Gesamtstrecke der Jagd in geteilten Tagebuch-Surfaces sichtbar sein. Setzbar nur durch Creator (RLS hunts_creator_all).';

-- ============================================================
-- E — user_settings Tabelle
-- ============================================================

CREATE TABLE user_settings (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  diary_default_view   text DEFAULT 'list' CHECK (diary_default_view IN ('list', 'map')),
  diary_share_anonymize boolean DEFAULT true,
  visible_wild_groups  jsonb DEFAULT '[
    "rehwild","schwarzwild","raubwild","rotwild",
    "hasenartig","federwild","damwild","sonstiges"
  ]'::jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

COMMENT ON TABLE user_settings IS
  'Pro-User-Einstellungen für das Jagdtagebuch (Default-View, Anonymisierungs-Default beim Teilen, sichtbare Wildgruppen-Tiles).';

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_owner_all"
  ON user_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMIT;
