import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { healthStatusSchema } from "@telegram-star/shared/contracts/health";
import { getConnectionStatus } from "../../services/telegram.js";

// API 版本用于多端客户端做兼容判断，和 npm 包版本解耦，避免小修小补误触发强制升级。
export const HEALTH_API_VERSION = "2026-07-01";
export const HEALTH_MIN_CLIENT_VERSION = "0.1.0";
export const HEALTH_RECOMMENDED_CLIENT_VERSION = "0.1.0";
export const HEALTH_SERVER_VERSION = "1.0.0";

type TelegramStatusLoader = typeof getConnectionStatus;

interface HealthStatusDependencies {
  getTelegramStatus: TelegramStatusLoader;
}

const defaultDependencies: HealthStatusDependencies = {
  getTelegramStatus: getConnectionStatus,
};

export async function getHealthStatus(
  dependencies: HealthStatusDependencies = defaultDependencies,
): Promise<HealthStatus> {
  const telegramStatus = await dependencies.getTelegramStatus();

  // 只暴露客户端连接前需要知道的摘要状态，不返回 API Hash、手机号、session 等敏感信息。
  return healthStatusSchema.parse({
    appName: "Telegram Star",
    serverVersion: HEALTH_SERVER_VERSION,
    apiVersion: HEALTH_API_VERSION,
    minClientVersion: HEALTH_MIN_CLIENT_VERSION,
    recommendedClientVersion: HEALTH_RECOMMENDED_CLIENT_VERSION,
    features: ["sse", "media"],
    telegram: {
      configured: telegramStatus.telegramConfigured,
      authorized: telegramStatus.authorized,
      connected: telegramStatus.connected,
    },
  });
}
