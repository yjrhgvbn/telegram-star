import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../config.js";
import * as schema from "./schema.js";

// Ensure the data directory exists
mkdirSync(dirname(appConfig.dbPath), { recursive: true });

const client = createClient({
  url: `file:${appConfig.dbPath}`,
});

export const db = drizzle(client, { schema });
export { client };
