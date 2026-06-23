import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "fs";
import { resolve } from "path";
import { appConfig } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chats.js";
import { configRoutes } from "./routes/config.js";
import { filterRoutes } from "./routes/filters.js";
import { messageRoutes } from "./routes/messages.js";
import { forwardTargetsRoutes } from "./routes/forwardTargets.js";
import { mediaRoutes } from "./routes/media.js";
import { loadMediaConfigFromDatabase, loadTelegramConfigFromDatabase } from "./services/appConfig.js";
import { initClient } from "./services/telegram.js";

const app = Fastify({ logger: true });

async function start() {
  // Register CORS
  await app.register(cors, {
    origin: appConfig.cors.origin === "*" ? true : appConfig.cors.origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Register API routes
  await app.register(configRoutes);
  await app.register(authRoutes);
  await app.register(chatRoutes);
  await app.register(filterRoutes);
  await app.register(messageRoutes);
  await app.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" });
  await app.register(mediaRoutes);

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

  await loadTelegramConfigFromDatabase();
  await loadMediaConfigFromDatabase();

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
