import { ACCESS_REQUIRED_EVENT, getAccessSession } from "@/shared/runtime/accessSession";
import type { ZodType } from "zod";
import { getRuntimeServerUrl } from "@/shared/runtime/serverConfig";
import { formatServerUnavailableMessage, isNetworkError } from "./errors";
import { getApiUrl } from "./url";
import { isDemo } from "@/demo/mode";

export async function request<T>(
  url: string,
  options?: RequestInit,
  responseSchema?: ZodType<T>,
  serverUrl = getRuntimeServerUrl(),
): Promise<T> {
  if (isDemo) {
    // A separate chunk keeps fictional data out of normal production builds.
    const { requestDemo } = await import("@/demo/api");
    const data = await requestDemo(url, options);
    return responseSchema ? responseSchema.parse(data) : (data as T);
  }
  const hasBody = options?.body !== undefined && options?.body !== null;
  const requestUrl = getApiUrl(url, serverUrl);
  const headers = new Headers(options?.headers);
  const session = getAccessSession(serverUrl);
  if (session && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${session.token}`);
  if (hasBody && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let res: Response;

  try {
    res = await fetch(requestUrl, {
      ...options,
      headers,
    });
  } catch (error) {
    // React Query 会通过 AbortSignal 取消过期的自动预览；取消不应被改写为后端离线。
    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    if (isNetworkError(error)) {
      throw new Error(formatServerUnavailableMessage(serverUrl));
    }

    throw error;
  }

  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/access/") && serverUrl === getRuntimeServerUrl() &&
        session?.token === getAccessSession(serverUrl)?.token) {
      // A late failure from the previous server/session must not lock a newer login.
      window.dispatchEvent(new CustomEvent(ACCESS_REQUIRED_EVENT, { detail: { serverUrl } }));
    }
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return responseSchema ? responseSchema.parse(data) : (data as T);
}
