import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.js";

/** Tests run actual deployed SQL in an isolated database, never the configured application DB. */
export function createMessageMembershipTestDatabase(options: { beforeRemovalMigration?: (sqlite: DatabaseSync) => void } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "telegram-star-membership-test-"));
  const path = join(directory, "test.db");
  const sqlite = new DatabaseSync(path);
  const migrationsPath = fileURLToPath(new URL("../../prisma/migrations/", import.meta.url));
  for (const migration of readdirSync(migrationsPath).sort()) {
    if (migration === "migration_lock.toml") continue;
    if (migration.endsWith("_rule_message_removal")) options.beforeRemovalMigration?.(sqlite);
    sqlite.exec(readFileSync(join(migrationsPath, migration, "migration.sql"), "utf8"));
  }
  sqlite.close();
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${path}` }) });
  return {
    db,
    path,
    async cleanup() {
      await db.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
