import { appConfig } from "./config.js";
import { createApp } from "./app.js";
import { db } from "./db/index.js";
import { assertAccessConfiguration } from "./modules/access/access.js";
import { loadMediaConfigFromDatabase, loadTelegramConfigFromDatabase } from "./services/appConfig.js";
import { initClient } from "./services/telegram.js";
import { resetTelegramClient } from "./services/telegram/auth.js";
import { startNotificationOutbox, stopNotificationOutbox } from "./services/notificationOutbox.js";
import { stopRuleExecutions } from "./services/ruleExecution.js";

async function start() {
  assertAccessConfiguration(appConfig.accessPassword);
  const app = await createApp();
  app.addHook("onClose", async () => {
    await resetTelegramClient();
    await stopNotificationOutbox();
    stopRuleExecutions();
    await db.$disconnect();
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    // close() waits for active HTTP connections. Close SSE first so shutdown is bounded.
    app.server.closeIdleConnections();
    app.server.closeAllConnections();
    await app.close();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  try {
    await loadTelegramConfigFromDatabase();
    await loadMediaConfigFromDatabase();
    startNotificationOutbox();
    await app.listen({ port: appConfig.port, host: appConfig.host });
    app.log.info({ event: "server.started", host: appConfig.host, port: appConfig.port,
      environment: process.env.NODE_ENV || "development", accessProtected: Boolean(appConfig.accessPassword) }, "Server started");
    if (appConfig.telegram.apiId && appConfig.telegram.apiHash) {
      try { await initClient(); }
      catch (err) { app.log.warn({ err, event: "telegram.client.initialize_failed" }, "Telegram initialization failed; waiting for UI login"); }
    } else {
      app.log.info({ event: "telegram.credentials.missing" }, "Telegram API credentials are not configured");
    }
  } catch (err) {
    app.log.error({ err, event: "server.start_failed" }, "Server failed to start");
    await shutdown();
    process.exitCode = 1;
  }
}

start().catch((error: unknown) => {
  // Configuration errors contain field names only, never the password value.
  console.error(error instanceof Error ? error.message : "Server startup failed");
  process.exitCode = 1;
});
