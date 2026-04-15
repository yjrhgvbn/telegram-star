import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "fs";
import { resolve } from "path";
import { appConfig } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { filterRoutes } from "./routes/filters.js";
import { messageRoutes } from "./routes/messages.js";
import { initClient } from "./services/telegram.js";
import { client } from "./db/index.js";

// Auto-create tables if DB is fresh
async function initDatabase() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('keyword', 'group', 'channel')),
      value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_message_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      chat_title TEXT NOT NULL DEFAULT '',
      sender_name TEXT NOT NULL DEFAULT '',
      sender_id TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      message_date TEXT NOT NULL,
      telegram_link TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      matched_filter_id INTEGER REFERENCES filters(id) ON DELETE SET NULL,
      matched_keyword TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log("[DB] Tables initialized");
}

const app = Fastify({ logger: true });

async function start() {
  // Initialize database
  await initDatabase();

  // Register CORS
  await app.register(cors, {
    origin: appConfig.cors.origin === "*" ? true : appConfig.cors.origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Register API routes
  await app.register(authRoutes);
  await app.register(filterRoutes);
  await app.register(messageRoutes);

  // Serve static frontend in production
  const webDistPath = resolve(
    import.meta.dirname || new URL(".", import.meta.url).pathname,
    "../../web/dist"
  );
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
    });

    // SPA fallback
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  // Start server
  try {
    await app.listen({ port: appConfig.port, host: appConfig.host });
    console.log(`[Server] Running at http://${appConfig.host}:${appConfig.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Initialize Telegram client (try to reconnect with saved session)
  if (appConfig.telegram.apiId && appConfig.telegram.apiHash) {
    try {
      await initClient();
    } catch (err) {
      console.log("[Telegram] Failed to initialize client, will wait for login via UI");
    }
  } else {
    console.log("[Telegram] API credentials not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH.");
  }
}

start();
