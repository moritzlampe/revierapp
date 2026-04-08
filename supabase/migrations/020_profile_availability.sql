-- 020: Verfügbarkeitsstatus für Profile (Du-Tab)
-- Moritz: Bitte im Supabase SQL Editor ausführen

ALTER TABLE profiles
  ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'available'
  CHECK (availability_status IN ('available', 'on_hunt', 'do_not_disturb'));
