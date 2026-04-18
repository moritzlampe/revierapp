-- 033_hunt_photos_replica_identity.sql
-- Sprint 58.1g.1a.3b.2-fix — DELETE-Events kommen im Strecke-Tab nicht an
--
-- Befund: Die Realtime-Subscription auf hunt_photos filtert mit
-- `hunt_id=eq.<id>`. Für DELETE-Events wertet Supabase den Filter gegen
-- die ALTE Zeile aus. Mit REPLICA IDENTITY DEFAULT enthält der WAL bei
-- DELETE jedoch nur den Primary Key — hunt_id fehlt, der Filter matcht
-- nicht, das Event wird nie zugestellt. Folge: Gelöschte Fotos
-- verschwinden erst nach erneutem Laden des Strecke-Tabs.
--
-- Fix: REPLICA IDENTITY FULL, damit der komplette alte Zustand im
-- Change-Event landet und der hunt_id-Filter greift.

BEGIN;

ALTER TABLE hunt_photos REPLICA IDENTITY FULL;

COMMIT;
