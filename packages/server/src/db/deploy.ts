import { spawnSync } from "child_process";
import { closeSync, mkdirSync, openSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../config.js";
import { appLogger } from "../shared/logging.js";

function runPrismaCommand(args: string[]): void {
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function deployDatabase(): Promise<void> {
  mkdirSync(dirname(appConfig.dbPath), { recursive: true });
  // Prisma's SQLite engine can fail before migration when the file is absent.
  // Create only the empty file, never tables or an existing database's contents.
  try {
    closeSync(openSync(appConfig.dbPath, "wx", 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  appLogger.info(
    { event: "database.migrations.applying" },
    "Applying Prisma migrations",
  );
  runPrismaCommand(["migrate", "deploy"]);
}

deployDatabase().catch((error) => {
  appLogger.error(
    { err: error, event: "database.migrations.failed" },
    "Prisma migration deploy failed",
  );
  process.exit(1);
});
