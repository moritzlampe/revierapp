-- ============================================================
-- Migration 052: hunts.map_open — Karten-Freigabe (Sprint C2)
-- ------------------------------------------------------------
-- Symmetrisch zu chat_open (051). Der Jagdleiter schaltet die
-- Kartenansicht vor dem Go-Live fuer joined-Mitglieder frei
-- (nur SEHEN — Einzeichnen/Editieren bleibt creator-only, rein
-- UI-seitig durchgesetzt).
--
-- KEIN RLS: reines UI-Gating. Die Karten-Lese-RLS (map_objects /
-- hunt_seat_assignments / boundary) ist joined-gescopt, nicht
-- status-gescopt — konsistent mit Sprint-C-L6 (chat_open hat
-- ebenfalls keine SELECT-RLS, nur die Insert-Policy).
--
-- Kein Cron, kein Enum. Trivial.
--
-- Ausfuehrung: EIN Run im Supabase SQL Editor (BEGIN…COMMIT).
-- Stand: 2026-06-05
-- ============================================================

BEGIN;

ALTER TABLE public.hunts
  ADD COLUMN IF NOT EXISTS map_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hunts.map_open IS
  'Jagdleiter schaltet die Kartenansicht fuer joined-Mitglieder vor '
  'Go-Live frei (nur sehen, nicht editieren). Analog chat_open. '
  'Reines UI-Gating, keine RLS.';

COMMIT;
