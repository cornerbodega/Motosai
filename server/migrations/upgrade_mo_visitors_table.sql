-- Migration script to upgrade existing mo_visitors table
-- Run this if you already have the old schema with just "count" column

-- Add new columns if they don't exist
ALTER TABLE mo_visitors
ADD COLUMN IF NOT EXISTS visitors INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS visits INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Migrate existing data: copy old "count" to "visitors" and "visits"
-- Assuming old records were tracking unique visitors
UPDATE mo_visitors
SET visitors = count, visits = count
WHERE visitors = 0 AND visits = 0 AND count > 0;

-- You can optionally drop the old "count" column after verifying the migration
-- ALTER TABLE mo_visitors DROP COLUMN IF EXISTS count;
