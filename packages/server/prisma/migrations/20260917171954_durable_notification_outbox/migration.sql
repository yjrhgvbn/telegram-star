-- DropIndex
DROP INDEX "messages_message_date_telegram_message_id_idx";

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "message_id" INTEGER NOT NULL,
    "message_key" TEXT NOT NULL,
    "filter_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" DATETIME,
    "lease_token" TEXT,
    "last_error_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "notification_outbox_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "forward_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_outbox_status_lease_until_idx" ON "notification_outbox"("status", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_message_id_target_id_key" ON "notification_outbox"("message_id", "target_id");

-- CreateIndex
CREATE INDEX "messages_message_date_telegram_message_id_id_idx" ON "messages"("message_date", "telegram_message_id", "id");
