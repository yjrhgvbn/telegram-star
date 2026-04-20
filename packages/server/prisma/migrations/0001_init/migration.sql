CREATE TABLE "filters" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "conditions" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE TABLE "messages" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "telegram_message_id" INTEGER NOT NULL,
  "chat_id" TEXT NOT NULL,
  "chat_title" TEXT NOT NULL DEFAULT '',
  "sender_name" TEXT NOT NULL DEFAULT '',
  "sender_id" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT '',
  "message_date" TEXT NOT NULL,
  "telegram_link" TEXT NOT NULL DEFAULT '',
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "matched_filter_id" INTEGER,
  "matched_keyword" TEXT,
  "created_at" TEXT NOT NULL,
  CONSTRAINT "messages_matched_filter_id_fkey"
    FOREIGN KEY ("matched_filter_id") REFERENCES "filters" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
