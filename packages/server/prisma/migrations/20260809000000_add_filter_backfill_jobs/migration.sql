-- CreateTable
CREATE TABLE "filter_backfill_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filter_id" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_at" TEXT,
    "end_at" TEXT,
    "per_chat_limit" INTEGER,
    "total_chats" INTEGER NOT NULL DEFAULT 0,
    "completed_chats" INTEGER NOT NULL DEFAULT 0,
    "scanned_messages" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "saved_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_existing_count" INTEGER NOT NULL DEFAULT 0,
    "current_chat_title" TEXT,
    "error" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "completed_at" TEXT,
    CONSTRAINT "filter_backfill_jobs_filter_id_fkey"
      FOREIGN KEY ("filter_id") REFERENCES "filters" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "filter_backfill_jobs_filter_id_created_at_idx"
ON "filter_backfill_jobs"("filter_id", "created_at");

-- CreateIndex
CREATE INDEX "filter_backfill_jobs_status_idx"
ON "filter_backfill_jobs"("status");
