-- Migration 043: hunts.cover_photo_id
-- Adds optional User-Custom-Cover for diary detail page.
-- Fallback chain (in app code, not DB): cover_photo_id > first hunt_photo
-- without kill_ids[] > first hunt_photo > no cover.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hunts'
      AND column_name = 'cover_photo_id'
  ) THEN
    ALTER TABLE public.hunts
      ADD COLUMN cover_photo_id uuid
      REFERENCES public.hunt_photos(id) ON DELETE SET NULL;

    COMMENT ON COLUMN public.hunts.cover_photo_id IS
      'Optional user-selected cover photo for diary detail page. NULL means use fallback (first mood-photo or first photo). ON DELETE SET NULL preserves hunt when chosen photo is deleted.';
  END IF;
END
$$;
