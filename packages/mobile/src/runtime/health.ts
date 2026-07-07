import {
  healthStatusSchema,
  type HealthStatus,
} from "@telegram-star/shared/contracts/health";
import {
  isSupportedServerUrl,
  normalizeServerUrl,
} from "./serverConfig";

export interface MobileHealthCheckOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function getHealthCheckUrl(serverUrl: string): string {
  const normalized = normalizeServerUrl(serverUrl);
  if (!isSupportedServerUrl(normalized)) {
    throw new Error("请输入以 http:// 或 https:// 开头的后端地址。");
  }

  return `${normalized}/api/health`;
}

export async function checkMobileServerHealth(
  serverUrl: string,
  options: MobileHealthCheckOptions = {},
): Promise<HealthStatus> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(getHealthCheckUrl(serverUrl), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`后端返回 HTTP ${response.status}，可能不是 Telegram Star 服务。`);
    }

    const parsed = healthStatusSchema.safeParse(await response.json());
    if (!parsed.success) {
      // 手机壳也必须校验 health 契约，避免扫码把任意网页保存成后端。
      throw new Error("这个地址可以访问，但不像 Telegram Star 后端。");
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("连接超时，请确认后端地址和网络是否可用。");
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
