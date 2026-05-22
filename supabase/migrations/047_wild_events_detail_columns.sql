-- 047_wild_events_detail_columns.sql
-- Sprint 60.5e-1 — Detailspalten für die Anblick-Erfassung
-- Referenz: docs/recon/Sprint_60_5e_Recon_Bericht_21052026.md
--           docs/recon/Sprint_60_5e_kills_Schema_Snapshot_22052026.md
-- Stand: 2026-05-22
--
-- Erweitert wild_events um 5 optionale Detailfelder. NUR Spalten —
-- keine Daten-Migration, keine UI-Anbindung. Die UI-Anbindung (Bearbeiten-
-- Maske auf der Tagebuch-Detailseite) folgt in Sprint 60.5e-2.
--
-- Entscheidungen (siehe finaler Sprint-Brief 60.5e-1):
--   - EN-Namensschema (gender/age_class/...) — wild_events ist durchgehend EN.
--     Symmetrie zur kills-Tabelle (geschlecht/altersklasse/...) wird in
--     60.5e-2 über einen Mapping-Layer in der App hergestellt, nicht in der DB.
--   - weight_estimate_kg ist eine EIGENE Spalte, kein Reuse von
--     kills.gewicht_kg — andere Semantik: kills.gewicht_kg = aufgebrochenes
--     Ist-Gewicht, wild_events.weight_estimate_kg = Schätzung ohne Erlegung.
--   - KEIN hit_zone — Anblicke haben keinen Treffer. Die Trefferzone einer
--     Erlegung bleibt in kills.hit_location.
--   - KEINE Trigger-Erweiterung. trg_kills_sync_wild_event bleibt unberührt;
--     kills ist und bleibt Source of Truth für Erlegungen.
--   - Idempotent via IF NOT EXISTS (Lehre aus Migration 039) — die Migration
--     darf gefahrlos wiederholt werden.

BEGIN;

ALTER TABLE wild_events
  ADD COLUMN IF NOT EXISTS gender             text,
  ADD COLUMN IF NOT EXISTS age_class          text,
  ADD COLUMN IF NOT EXISTS weight_estimate_kg double precision,
  ADD COLUMN IF NOT EXISTS distance_m         integer,
  ADD COLUMN IF NOT EXISTS photo_url          text;

COMMENT ON COLUMN wild_events.gender IS
  'Geschlecht des beobachteten Wilds (optional). Freitext, EN-Schema. Mapping zu kills.geschlecht in Sprint 60.5e-2.';
COMMENT ON COLUMN wild_events.age_class IS
  'Altersklasse des beobachteten Wilds (optional). Freitext, EN-Schema. Mapping zu kills.altersklasse in Sprint 60.5e-2.';
COMMENT ON COLUMN wild_events.weight_estimate_kg IS
  'Geschätztes Gewicht in kg (optional). Schätzung ohne Erlegung — NICHT zu verwechseln mit kills.gewicht_kg (aufgebrochenes Ist-Gewicht).';
COMMENT ON COLUMN wild_events.distance_m IS
  'Geschätzte Entfernung in Metern (optional).';
COMMENT ON COLUMN wild_events.photo_url IS
  'URL eines optionalen Fotos zum Event. UI-Anbindung folgt in Sprint 60.5e-2.';

COMMIT;
