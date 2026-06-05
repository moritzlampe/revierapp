-- ============================================================
-- Migration 050: hunt_status += 'scheduled' (Sprint C)
-- ------------------------------------------------------------
-- Eigene Migration — ADD VALUE darf nicht in derselben
-- Transaktion verwendet werden, in der der neue Wert gelesen/
-- geschrieben wird (PG 17, vgl. 038 fuer 'auto_completed').
--
-- Dieser Run MUSS allein committed sein, BEVOR 051 laeuft: die
-- Cron-Job-Bodies in 051 (activate-scheduled-hunts /
-- auto-end-stale-hunts) referenzieren 'scheduled' und schlagen
-- sonst beim spaeteren Lauf fehl.
--
-- Ausfuehrung: EIN Run im Supabase SQL Editor, ALLEIN. KEIN
--   weiteres Statement in denselben Run.
-- Stand: 2026-06-05
-- ============================================================

ALTER TYPE hunt_status ADD VALUE IF NOT EXISTS 'scheduled';
