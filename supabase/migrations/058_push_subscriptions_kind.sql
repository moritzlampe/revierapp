-- 058_push_subscriptions_kind.sql
-- Additive kind-Spalte auf push_subscriptions für native (Expo) Push-Clients
-- neben dem bestehenden Web-Push (VAPID). Grundlage T0.C1.
--
-- Design locks (T0 D2): additive Spalte, KEINE neue Tabelle. Der Web-Zweig
-- der Send-Route filtert ab jetzt kind='web'; alle Bestands-Rows sind durch
-- den Default 'web' rückwirkend korrekt (PWA bleibt unverändert).
--
-- Speicherformat Expo: Die native App legt ihre Push-Rows mit
--   subscription = {"expoPushToken": "ExponentPushToken[xxxxxxxx]"}
-- im bestehenden subscription-jsonb ab (kein neues Spaltenlayout nötig).
-- Der bestehende UNIQUE(user_id, subscription) trägt die Dedup damit weiter —
-- ein Gerät = eine Row, unabhängig von kind.
--
-- RLS bleibt unverändert: die self-scoped SELECT/INSERT/DELETE-Policies aus
-- 008 genügen auch für native Clients (jeder verwaltet nur seine eigenen Rows).
--
-- Additiv, idempotent (IF NOT EXISTS + benannter Constraint via DO-Block),
-- PWA-kompatibel.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'web';

-- Benannter CHECK-Constraint, idempotent: ein zweiter Lauf würde sonst mit
-- duplicate_object (42710) abbrechen.
DO $$ BEGIN
  ALTER TABLE public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_kind_check CHECK (kind IN ('web', 'expo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.push_subscriptions.kind IS
  'web = Browser Web-Push (VAPID), expo = native Expo Push. Expo-Rows speichern {"expoPushToken":"ExponentPushToken[...]"} im subscription-jsonb.';
