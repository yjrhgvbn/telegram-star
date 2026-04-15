import { config } from "dotenv";
config();

export const appConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  dbPath: process.env.DB_PATH || "./data/telegram-star.db",
  telegram: {
    apiId: parseInt(process.env.TELEGRAM_API_ID || "0", 10),
    apiHash: process.env.TELEGRAM_API_HASH || "",
    sessionPath: process.env.SESSION_PATH || "./data/session.txt",
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
};
