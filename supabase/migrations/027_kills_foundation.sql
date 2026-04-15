-- 027_kills_foundation.sql
-- Foundation für Erlegung-Melden Feature (Sprint 58.1)
-- Quelle: BERICHT_58_1a_Erlegung.md
-- Stand: 2026-04-15

BEGIN;

-- ============================================================
-- A.1 — Neue Enums
-- ============================================================

-- Status der Erlegung
CREATE TYPE kill_status AS ENUM (
  'harvested',   -- erlegt (Default)
  'wounded'      -- krank geschossen (für späteren Nachsuche-Trigger)
  -- 'missed' bewusst weggelassen — kommt erst mit Premium-Statistik
);

-- Sichtbarkeit von Kills innerhalb einer Hunt
CREATE TYPE kill_visibility AS ENUM (
  'all',                      -- alle Hunt-Teilnehmer (Default)
  'leader_only',              -- nur Jagdleiter
  'leader_and_groupleader'    -- Jagdleiter + Gruppenleiter
);

-- ============================================================
-- A.2 — wild_art Enum erweitern
-- ============================================================

-- Generische Wildgruppen-Werte (für "X, unbekannt" Schnellmeldung)
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'rehwild_unspez';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'schwarzwild_unspez';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'rotwild_unspez';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'damwild_unspez';

-- Spezifische Werte die fehlen
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'bockkitz';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'schmalbock';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'schmalreh';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'hase';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'wildkaninchen';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'ente';

-- ============================================================
-- A.3 — geschlecht-Spalte aufweichen
-- ============================================================

-- 'unbekannt' existiert bereits im geschlecht-Enum (siehe 003)

-- NOT NULL droppen — erlaubt NULL für "noch nicht ausgefüllt"
ALTER TABLE kills ALTER COLUMN geschlecht DROP NOT NULL;

-- Default entfernen (NULL = nicht ausgefüllt, 'unbekannt' = bewusst unbekannt)
ALTER TABLE kills ALTER COLUMN geschlecht SET DEFAULT NULL;

-- ============================================================
-- A.4 — Neue Spalten
-- ============================================================

-- Status-Spalte mit Default
ALTER TABLE kills
  ADD COLUMN IF NOT EXISTS status kill_status NOT NULL DEFAULT 'harvested';

-- Index für Status-Filter
CREATE INDEX IF NOT EXISTS idx_kills_status ON kills(status);

-- Sichtbarkeit pro Hunt
ALTER TABLE hunts
  ADD COLUMN IF NOT EXISTS kill_visibility kill_visibility NOT NULL DEFAULT 'all';

-- ============================================================
-- A.5 — Helper-Funktionen gegen RLS-Rekursion
-- ============================================================

-- Pattern aus 009_fix_chat_group_members_rls.sql (get_my_group_ids)
-- SECURITY DEFINER umgeht RLS auf hunt_participants

CREATE OR REPLACE FUNCTION get_my_hunt_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT hunt_id FROM hunt_participants WHERE user_id = auth.uid();
$$;

-- Variante: nur Hunts wo ich Jagdleiter bin
CREATE OR REPLACE FUNCTION get_my_hunt_ids_as_leader()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT hunt_id FROM hunt_participants
  WHERE user_id = auth.uid() AND role = 'jagdleiter';
$$;

-- Variante: Hunts wo ich Jagdleiter ODER Gruppenleiter bin
CREATE OR REPLACE FUNCTION get_my_hunt_ids_as_leader_or_groupleader()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT hunt_id FROM hunt_participants
  WHERE user_id = auth.uid()
    AND (role = 'jagdleiter' OR 'gruppenleiter' = ANY(tags));
$$;

-- ============================================================
-- A.6 — Neue RLS-Policies für kills (Visibility-basiert)
-- ============================================================

-- Bestehende Policies bleiben:
--   kills_reporter (ALL für reporter_id = auth.uid())
--   kills_district_owner (SELECT für district_id owner)

-- Sicherheitshalber alte Versionen droppen falls Migration wiederholt wird
DROP POLICY IF EXISTS "kills_visibility_all" ON kills;
DROP POLICY IF EXISTS "kills_visibility_leader" ON kills;
DROP POLICY IF EXISTS "kills_visibility_leader_groupleader" ON kills;

-- Visibility = 'all': alle Hunt-Teilnehmer sehen Kills
CREATE POLICY "kills_visibility_all" ON kills FOR SELECT USING (
  hunt_id IN (SELECT get_my_hunt_ids())
  AND (
    SELECT kill_visibility FROM hunts WHERE id = kills.hunt_id
  ) = 'all'
);

-- Visibility = 'leader_only': nur Jagdleiter sieht Kills
CREATE POLICY "kills_visibility_leader" ON kills FOR SELECT USING (
  hunt_id IN (SELECT get_my_hunt_ids_as_leader())
  AND (
    SELECT kill_visibility FROM hunts WHERE id = kills.hunt_id
  ) = 'leader_only'
);

-- Visibility = 'leader_and_groupleader': Jagdleiter + Gruppenleiter
CREATE POLICY "kills_visibility_leader_groupleader" ON kills FOR SELECT USING (
  hunt_id IN (SELECT get_my_hunt_ids_as_leader_or_groupleader())
  AND (
    SELECT kill_visibility FROM hunts WHERE id = kills.hunt_id
  ) = 'leader_and_groupleader'
);

COMMIT;
