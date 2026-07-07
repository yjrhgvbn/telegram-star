import {
  healthStatusSchema,
  type HealthStatus,
} from "@telegram-star/shared/contracts/health";
import { normalizeServerUrl } from "@/shared/runtime/serverConfig";
import { formatServerUnavailableMessage, isNetworkError } from "./errors";
import { getApiUrl } from "./url";

export type ServerConnectionState = "unknown" | "checking" | "connected" | "failed";

export async function checkServerHealth(serverUrl: string): Promise<HealthStatus> {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const healthUrl = getApiUrl("/health", normalizedServerUrl);
  let response: Response;

  try {
    response = await fetch(healthUrl, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error(formatServerUnavailableMessage(normalizedServerUrl));
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(`后端返回 HTTP ${response.status}，可能不是 Telegram Star 服务。`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("后端返回内容不是 JSON，可能不是 Telegram Star 服务。");
  }

  const parsed = healthStatusSchema.safeParse(data);
  if (!parsed.success) {
    // 健康检查必须校验契约，避免把任意可访问网页误判成可用后端。
    throw new Error("这个地址可以访问，但不像 Telegram Star 后端。");
  }

  return parsed.data;
}
