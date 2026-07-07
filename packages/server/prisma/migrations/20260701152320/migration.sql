-- CreateTable
CREATE TABLE "client_devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "os" TEXT,
    "app_version" TEXT,
    "capabilities" TEXT NOT NULL DEFAULT '{}',
    "push_token" TEXT,
    "last_seen_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" DATETIME
);

-- CreateIndex
CREATE INDEX "client_devices_last_seen_at_idx" ON "client_devices"("last_seen_at");

-- CreateIndex
CREATE INDEX "client_devices_type_platform_idx" ON "client_devices"("type", "platform");
