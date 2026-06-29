import { appConfig } from "./config.js";
import { createApp } from "./app.js";
import { loadMediaConfigFromDatabase, loadTelegramConfigFromDatabase } from "./services/appConfig.js";
import { initClient } from "./services/telegram.js";

async function start() {
  const app = await createApp();

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
