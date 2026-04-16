import { PrismaLibSql } from "@prisma/adapter-libsql";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";

mkdirSync(dirname(appConfig.dbPath), { recursive: true });

const adapter = new PrismaLibSql({
  url: appConfig.databaseUrl,
});

export const db = new PrismaClient({ adapter });
