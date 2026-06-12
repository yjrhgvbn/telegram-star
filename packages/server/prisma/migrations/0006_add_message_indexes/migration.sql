-- CreateIndex
CREATE INDEX "messages_message_date_telegram_message_id_idx" ON "messages"("message_date" DESC, "telegram_message_id" DESC);

-- CreateIndex
CREATE INDEX "messages_matched_filter_id_is_read_message_date_idx" ON "messages"("matched_filter_id", "is_read", "message_date" DESC);

-- CreateIndex
CREATE INDEX "messages_is_read_message_date_idx" ON "messages"("is_read", "message_date" DESC);
