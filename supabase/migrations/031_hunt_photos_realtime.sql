-- 031_hunt_photos_realtime.sql
-- Sprint 58.1g.1a.3b.1 — hunt_photos zur Realtime-Publication hinzufügen
-- Zweck: tab-scoped Realtime-Updates wenn Fotos im Strecke-Tab erscheinen

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE hunt_photos;

COMMIT;
