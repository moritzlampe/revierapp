-- Migration 045: hunts.kind DEFAULT entfernen
-- Sprint 60.5d — I1
-- Vorher: kind hunt_kind NOT NULL DEFAULT 'group'. Jeder Insert-Pfad der
-- kind vergisst erbt still ein falsches 'group'. Nach dem 21.05.-Recon setzt
-- heute jeder Pfad (createSoloHunt + handleCreate) kind explizit — der Default
-- ist nur noch eine Footgun fuer kuenftige Insert-Pfade.
-- NOT NULL bleibt: ein Insert ohne kind soll laut fehlschlagen, nicht still
-- 'group' werden. Das ENUM hunt_kind (group, solo) schuetzt den Wertebereich.

ALTER TABLE public.hunts ALTER COLUMN kind DROP DEFAULT;
