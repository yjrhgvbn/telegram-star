-- Add per-filter auto-locate setting, default enabled for existing and new rows.
ALTER TABLE "filters"
ADD COLUMN "auto_locate_unread_near_read" BOOLEAN NOT NULL DEFAULT true;
