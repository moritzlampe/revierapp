-- 032_profile_anonymize_kills.sql
-- Sprint 58.1g.1a.3d — Anonymisierungs-Flag für Strecken-Anzeige

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS anonymize_kills BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.anonymize_kills IS
  'Wenn true, erscheint dieser User in der Strecke-Liste anderer Schützen als „Jäger". '
  'Jagdleiter (später: Gruppenleiter, Schweißhundführer) sehen weiterhin den Klartext-Namen. '
  'Blue-Tick: Wer selbst anonym ist, sieht alle anderen Nicht-Privilegierten ebenfalls anonym.';

COMMIT;
