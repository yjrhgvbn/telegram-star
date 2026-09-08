-- CreateTable
CREATE TABLE "message_filter_memberships" (
    "message_id" INTEGER NOT NULL,
    "filter_id" INTEGER NOT NULL,
    "matched_keyword" TEXT,
    "created_at" TEXT NOT NULL,

    PRIMARY KEY ("message_id", "filter_id"),
    CONSTRAINT "message_filter_memberships_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_filter_memberships_filter_id_fkey" FOREIGN KEY ("filter_id") REFERENCES "filters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "message_removals" (
    "chat_id" TEXT NOT NULL,
    "telegram_message_id" INTEGER NOT NULL,
    "filter_id" INTEGER NOT NULL,
    "removed_at" TEXT NOT NULL,
    "block_backfill" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("chat_id", "telegram_message_id", "filter_id"),
    CONSTRAINT "message_removals_filter_id_fkey" FOREIGN KEY ("filter_id") REFERENCES "filters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_filter_backfill_jobs" (
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
    "skipped_removed_count" INTEGER NOT NULL DEFAULT 0,
    "current_chat_title" TEXT,
    "error" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "completed_at" TEXT,
    CONSTRAINT "filter_backfill_jobs_filter_id_fkey" FOREIGN KEY ("filter_id") REFERENCES "filters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_filter_backfill_jobs" ("completed_at", "completed_chats", "created_at", "current_chat_title", "end_at", "error", "filter_id", "id", "matched_count", "mode", "per_chat_limit", "saved_count", "scanned_messages", "skipped_existing_count", "start_at", "status", "total_chats", "updated_at") SELECT "completed_at", "completed_chats", "created_at", "current_chat_title", "end_at", "error", "filter_id", "id", "matched_count", "mode", "per_chat_limit", "saved_count", "scanned_messages", "skipped_existing_count", "start_at", "status", "total_chats", "updated_at" FROM "filter_backfill_jobs";
DROP TABLE "filter_backfill_jobs";
ALTER TABLE "new_filter_backfill_jobs" RENAME TO "filter_backfill_jobs";
CREATE INDEX "filter_backfill_jobs_filter_id_created_at_idx" ON "filter_backfill_jobs"("filter_id", "created_at");
CREATE INDEX "filter_backfill_jobs_status_idx" ON "filter_backfill_jobs"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "message_filter_memberships_filter_id_message_id_idx" ON "message_filter_memberships"("filter_id", "message_id");

-- CreateIndex
CREATE INDEX "message_removals_filter_id_idx" ON "message_removals"("filter_id");

-- Preserve the previously recorded rule and keyword without deleting standalone messages.
INSERT INTO "message_filter_memberships" ("message_id", "filter_id", "matched_keyword", "created_at")
SELECT "id", "matched_filter_id", "matched_keyword", "created_at"
FROM "messages"
WHERE "matched_filter_id" IS NOT NULL;
