import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(import.meta.dirname, "../../../.env") });
config();

const databaseUrl = process.env.DATABASE_URL;
const dbPathFromUrl = databaseUrl?.startsWith("file:") ? databaseUrl.slice(5) : undefined;
const dbPath = process.env.DB_PATH || dbPathFromUrl || "./data/telegram-star.db";
const envTelegramApiId = process.env.TELEGRAM_API_ID
  ? parseInt(process.env.TELEGRAM_API_ID, 10)
  : undefined;
const envTelegramApiHash = process.env.TELEGRAM_API_HASH;

export const appConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  dbPath,
  databaseUrl: databaseUrl || `file:${dbPath}`,
  telegram: {
    apiId: Number.isFinite(envTelegramApiId) ? envTelegramApiId : 0,
    apiHash: envTelegramApiHash || "",
    sessionPath: process.env.SESSION_PATH || "./data/session.txt",
    envApiId: Number.isFinite(envTelegramApiId) ? envTelegramApiId : undefined,
    envApiHash: envTelegramApiHash,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
  notifications: {
    settingsPath: "./data/notification-settings.json",
  },
  media: {
    thumbIndex: 1,
  },
};

export function updateTelegramConfig(config: { apiId: number; apiHash: string }): void {
  appConfig.telegram.apiId = config.apiId;
  appConfig.telegram.apiHash = config.apiHash;
}

export function hasTelegramConfig(): boolean {
  return appConfig.telegram.apiId > 0 && appConfig.telegram.apiHash.trim().length > 0;
}

export function hasEnvTelegramConfig(): boolean {
  return (
    typeof appConfig.telegram.envApiId === "number" &&
    appConfig.telegram.envApiId > 0 &&
    Boolean(appConfig.telegram.envApiHash?.trim())
  );
}

export function updateMediaConfig(config: { thumbIndex: number }): void {
  appConfig.media.thumbIndex = config.thumbIndex;
}
