-- Migration 044: kills.hit_location
-- Adds optional shot placement (Trefferlage) per kill.
-- Display labels are mapped in app code (similar to wild_art enum).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'hit_location'
  ) THEN
    CREATE TYPE public.hit_location AS ENUM (
      'kammer',
      'blattschuss',
      'traeger',
      'weidwund',
      'krellschuss',
      'lauf',
      'sonstige'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kills'
      AND column_name = 'hit_location'
  ) THEN
    ALTER TABLE public.kills
      ADD COLUMN hit_location public.hit_location;

    COMMENT ON COLUMN public.kills.hit_location IS
      'Optional shot placement. Display labels mapped in app code (similar to wild_art). Empty/NULL is expected — many hunters do not record this.';
  END IF;
END
$$;
