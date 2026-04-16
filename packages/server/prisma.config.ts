import "dotenv/config";
import { defineConfig } from "prisma/config";

const dbPath = process.env.DB_PATH || "./data/telegram-star.db";
const databaseUrl = process.env.DATABASE_URL || `file:${dbPath}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
