-- ============================================================
-- Migration 055: districts — joined-Teilnehmer dürfen Reviergrenze sehen
-- ------------------------------------------------------------
-- Problem: districts hatte seit 003 nur zwei SELECT-Pfade:
--   - districts_owner_all  (owner_id = auth.uid())
--   - districts_jes_select (aktive Jagderlaubnis)
-- Ein joined-Teilnehmer (z.B. Heinrich) einer revier-verknüpften Jagd
-- sah die Reviergrenze NICHT — RLS lieferte 0 Zeilen, die PWA verschluckte
-- den PGRST116 kommentarlos und rendert grenzenlos. Sicherheitsrelevant
-- bei Drückjagd.
--
-- Lösung: additiver joined-Pfad über SECURITY-DEFINER-Helper-Function.
-- KEINE Inline-Subquery in der Policy — sonst läse die districts-Policy
-- hunts/hunt_participants (eigene RLS) → Policy-Rekursion. Die Function
-- umgeht das wie get_my_joined_hunt_ids() aus 048.
--
-- Owner-Policy (districts_owner_all) und JES-Policy bleiben unangetastet.
--
-- Ausführung: EIN Run im Supabase SQL Editor (BEGIN…COMMIT).
-- Stand: 2026-06-24
-- ============================================================

BEGIN;

-- ============================================================
-- A — Helper: "ist auth.uid() joined-Teilnehmer einer Jagd auf diesem Revier?"
--     FK-Kette: hunt_participants.user_id -> hunt_participants.hunt_id
--               -> hunts.id -> hunts.district_id -> districts.id
--     status='joined' (analog 048: erst zusagen, dann reinsehen; deckungs-
--     gleich mit map_objects_hunt_member / positions_current_hunt_member).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_hunt_participant_of_district(d_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hunt_participants hp
    JOIN hunts h ON h.id = hp.hunt_id
    WHERE hp.user_id = auth.uid()
      AND hp.status = 'joined'
      AND h.district_id = d_id
  );
$$;

-- ============================================================
-- B — Additive SELECT-Policy auf districts (neben owner/jes)
-- ============================================================

DROP POLICY IF EXISTS "districts_joined_participant_select" ON districts;
CREATE POLICY "districts_joined_participant_select" ON districts FOR SELECT
  USING (public.is_hunt_participant_of_district(id));

COMMIT;
