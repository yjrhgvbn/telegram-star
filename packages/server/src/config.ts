import { config } from "dotenv";
config();

const databaseUrl = process.env.DATABASE_URL;
const dbPathFromUrl = databaseUrl?.startsWith("file:") ? databaseUrl.slice(5) : undefined;
const dbPath = process.env.DB_PATH || dbPathFromUrl || "./data/telegram-star.db";

export const appConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  dbPath,
  databaseUrl: databaseUrl || `file:${dbPath}`,
  telegram: {
    apiId: parseInt(process.env.TELEGRAM_API_ID || "0", 10),
    apiHash: process.env.TELEGRAM_API_HASH || "",
    sessionPath: process.env.SESSION_PATH || "./data/session.txt",
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
  notifications: {
    settingsPath: "./data/notification-settings.json",
  },
};
