-- CreateTable
CREATE TABLE "read_sync_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "chat_id" TEXT,
    "telegram_message_id" INTEGER,
    "row_id" INTEGER,
    "details_json" TEXT,
    "created_at" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "read_sync_logs_created_at_idx" ON "read_sync_logs"("created_at");

-- CreateIndex
CREATE INDEX "read_sync_logs_source_idx" ON "read_sync_logs"("source");
