-- Sprint 58.1g.x — Auto-End-Feature
-- Add auto_completed status to hunt_status enum
-- Must be in its own migration (PG limitation:
-- new enum values not usable in same transaction)

ALTER TYPE hunt_status ADD VALUE IF NOT EXISTS 'auto_completed';
