-- 034_kills_kapital_notizen.sql
-- Persistenz für Kapital-Flag und Notiz-Feld im Kill-Detail (Sprint 58.1i)
-- Referenz: docs/recon/BERICHT_58_1h_design_review.md — Aufgabe 1
-- Stand: 2026-04-21

BEGIN;

-- ============================================================
-- Neue Spalten auf kills
-- ============================================================

-- Kapital-Markierung (manuell vom Reporter gesetzt, niemals automatisch)
-- Spec §11.4: „Kein Auto-Kapital, manuelle User-Markierung"
ALTER TABLE kills
  ADD COLUMN IF NOT EXISTS kapital BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN kills.kapital IS
  'Kapital-Flag: manuell vom Reporter gesetzt. Dient später für Trophy-Filter in der Revierzentrale.';

-- Freitextnotiz zum Kill (Wetter, Besonderheiten, Wildbret-Hinweise)
ALTER TABLE kills
  ADD COLUMN IF NOT EXISTS notiz TEXT NULL;

COMMENT ON COLUMN kills.notiz IS
  'Freitextnotiz zum Kill. Nur vom Reporter editierbar. Sichtbar für alle, die den Kill laut kill_visibility sehen.';

-- ============================================================
-- RLS — keine neuen Policies nötig
-- ============================================================
--
-- UPDATE auf kapital/notiz wird durch die bestehende "kills_reporter"-Policy
-- (003_quickhunt_schema.sql:618, ALL für reporter_id = auth.uid()) abgedeckt.
-- Andere Hunt-Teilnehmer sehen die Werte via kills_visibility_*-Policies,
-- können sie aber nicht ändern. Die UI muss den Lese-Modus durchsetzen.

COMMIT;
