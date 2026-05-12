-- CreateTable
CREATE TABLE "notification_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "config_key" TEXT NOT NULL,
    "config_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_config_key_key" ON "notification_settings"("config_key");
