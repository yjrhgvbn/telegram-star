-- Preserve the read state on the oldest copy before removing historical duplicates.
UPDATE "messages"
SET "is_read" = 1
WHERE "id" IN (
    SELECT MIN("id")
    FROM "messages"
    GROUP BY "chat_id", "telegram_message_id"
    HAVING MAX("is_read") = 1
);

-- Earlier listener versions used a non-atomic find-then-create check and could
-- produce duplicate rows when live ingestion and history backfill overlapped.
DELETE FROM "messages"
WHERE "id" NOT IN (
    SELECT MIN("id")
    FROM "messages"
    GROUP BY "chat_id", "telegram_message_id"
);

-- CreateIndex
CREATE UNIQUE INDEX "messages_chat_id_telegram_message_id_key"
ON "messages"("chat_id", "telegram_message_id");
