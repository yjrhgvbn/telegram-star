import { appConfig } from "./config.js";
import { createApp } from "./app.js";
import { loadMediaConfigFromDatabase, loadTelegramConfigFromDatabase } from "./services/appConfig.js";
import { initClient } from "./services/telegram.js";

async function start() {
  const app = await createApp();

  // Start server
  try {
    await app.listen({ port: appConfig.port, host: appConfig.host });
    app.log.info(
      {
        event: "server.started",
        host: appConfig.host,
        port: appConfig.port,
        environment: process.env.NODE_ENV || "development",
      },
      "Server started",
    );
  } catch (err) {
    app.log.error({ err, event: "server.start_failed" }, "Server failed to start");
    process.exit(1);
  }

  await loadTelegramConfigFromDatabase();
  await loadMediaConfigFromDatabase();

  // Initialize Telegram client (try to reconnect with saved session)
  if (appConfig.telegram.apiId && appConfig.telegram.apiHash) {
    try {
      await initClient();
    } catch (err) {
      app.log.warn(
        { err, event: "telegram.client.initialize_failed" },
        "Telegram client initialization failed; waiting for UI login",
      );
    }
  } else {
    app.log.info(
      { event: "telegram.credentials.missing" },
      "Telegram API credentials are not configured",
    );
  }
}

start();
