/*
  Warnings:

  - You are about to drop the `notification_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "messages_is_read_message_date_idx";

-- DropIndex
DROP INDEX "messages_matched_filter_id_is_read_message_date_idx";

-- DropIndex
DROP INDEX "messages_message_date_telegram_message_id_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "notification_settings";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "forward_targets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "apprise_url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_FilterToForwardTarget" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_FilterToForwardTarget_A_fkey" FOREIGN KEY ("A") REFERENCES "filters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_FilterToForwardTarget_B_fkey" FOREIGN KEY ("B") REFERENCES "forward_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_FilterToForwardTarget_AB_unique" ON "_FilterToForwardTarget"("A", "B");

-- CreateIndex
CREATE INDEX "_FilterToForwardTarget_B_index" ON "_FilterToForwardTarget"("B");

-- CreateIndex
CREATE INDEX "messages_message_date_telegram_message_id_idx" ON "messages"("message_date", "telegram_message_id");

-- CreateIndex
CREATE INDEX "messages_matched_filter_id_is_read_message_date_idx" ON "messages"("matched_filter_id", "is_read", "message_date");

-- CreateIndex
CREATE INDEX "messages_is_read_message_date_idx" ON "messages"("is_read", "message_date");
