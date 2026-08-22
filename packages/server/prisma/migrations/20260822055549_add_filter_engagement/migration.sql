-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "filter_groups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);
CREATE UNIQUE INDEX "filter_groups_name_key" ON "filter_groups"("name");
CREATE TABLE "new_filters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "system_key" TEXT,
    "conditions" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_locate_unread_near_read" BOOLEAN NOT NULL DEFAULT true,
    "is_focused" BOOLEAN NOT NULL DEFAULT false,
    "last_engaged_at" TEXT,
    "last_engagement_type" TEXT,
    "last_engaged_message_id" INTEGER,
    "manual_group_id" INTEGER,
    "manual_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "filters_manual_group_id_fkey" FOREIGN KEY ("manual_group_id") REFERENCES "filter_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_filters" ("auto_locate_unread_near_read", "conditions", "created_at", "enabled", "id", "name", "updated_at") SELECT "auto_locate_unread_near_read", "conditions", "created_at", "enabled", "id", "name", "updated_at" FROM "filters";
DROP TABLE "filters";
ALTER TABLE "new_filters" RENAME TO "filters";
UPDATE "filters" SET "manual_sort_order" = "manual_sort_order" + 1 WHERE "manual_group_id" IS NULL;
INSERT INTO "filters" (
    "name",
    "system_key",
    "conditions",
    "enabled",
    "auto_locate_unread_near_read",
    "manual_group_id",
    "manual_sort_order",
    "created_at",
    "updated_at"
) VALUES (
    '全部消息',
    'all_messages',
    '[]',
    false,
    false,
    NULL,
    0,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
CREATE UNIQUE INDEX "filters_system_key_key" ON "filters"("system_key");
CREATE INDEX "filters_manual_group_id_manual_sort_order_idx" ON "filters"("manual_group_id", "manual_sort_order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
