-- AlterTable
ALTER TABLE "messages" ADD COLUMN "media_duration" INTEGER;
ALTER TABLE "messages" ADD COLUMN "media_extra" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_file_name" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_file_size" INTEGER;
ALTER TABLE "messages" ADD COLUMN "media_mime_type" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_thumb_base64" TEXT;
ALTER TABLE "messages" ADD COLUMN "media_type" TEXT;

