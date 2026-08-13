import { spawnSync } from "child_process";
import { mkdirSync } from "fs";
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
