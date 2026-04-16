-- Migration 029 — Auto-Solo-Hunt Foundation
-- Enum hunt_kind + kind-Spalte + last_activity_at + find_districts_for_point RPC

BEGIN;

-- ==========================================================================
-- 1. ENUM hunt_kind
-- ==========================================================================

CREATE TYPE hunt_kind AS ENUM ('group', 'solo');

-- ==========================================================================
-- 2. hunts.kind — NOT NULL, Default 'group' (alle bestehenden Hunts sind Gruppenjagden)
-- ==========================================================================

ALTER TABLE hunts
  ADD COLUMN kind hunt_kind NOT NULL DEFAULT 'group';

CREATE INDEX idx_hunts_kind ON hunts (kind);

-- ==========================================================================
-- 3. hunts.last_activity_at — für späteres 12h-Auto-End (58.1g), hier nur Spalte
-- ==========================================================================

ALTER TABLE hunts
  ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_hunts_last_activity_at ON hunts (last_activity_at);

-- ==========================================================================
-- 4. RPC find_districts_for_point(lng, lat)
--    Gibt alle Districts zurück, deren boundary den Punkt enthält.
--    SETOF, weil Überlappungen vorkommen können.
--    Nutzt GiST-Index idx_districts_geo auf districts.boundary.
--    Boundary ist geometry(Polygon, 4326) — kein ST_Transform nötig.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.find_districts_for_point(
  p_lng double precision,
  p_lat double precision
)
RETURNS SETOF districts
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT d.*
  FROM districts d
  WHERE ST_Contains(
    d.boundary,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  )
  ORDER BY d.name ASC;
$$;

COMMENT ON FUNCTION public.find_districts_for_point IS
  'Findet alle Reviere, deren Polygon-Boundary den GPS-Punkt (lng, lat in WGS84) enthält. SETOF, da Überlappungen möglich sind. Wird von Auto-Solo-Hunt-Flow verwendet.';

-- RLS-Hinweis: Die RPC läuft mit SECURITY INVOKER, also greifen die normalen
-- districts-SELECT-Policies. User sehen nur Districts, die sie ohnehin lesen dürfen.

COMMIT;
