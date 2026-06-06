-- 053_districts_hidden.sql
-- Scope A: Revier ausblenden/einblenden in der "Du"-Liste.
-- Additiv: NOT NULL DEFAULT false -> kein Backfill, bestehende Reviere bleiben sichtbar.
-- Kein RLS-Eingriff: districts_owner_all (FOR ALL, owner_id = auth.uid(),
-- 003_quickhunt_schema.sql:572) deckt das UPDATE ab. Keine separate restriktive
-- UPDATE-Policy vorhanden (Recon bestaetigt).

BEGIN;

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN districts.hidden IS
  'Owner-side soft-hide: removes district from the Du list without deleting data. Reversible.';

COMMIT;
