import type { ZodType } from "zod";
import { getRuntimeServerUrl } from "@/shared/runtime/serverConfig";
import { formatServerUnavailableMessage, isNetworkError } from "./errors";
import { getApiUrl } from "./url";

export async function request<T>(
  url: string,
  options?: RequestInit,
  responseSchema?: ZodType<T>,
): Promise<T> {
  const hasBody = options?.body !== undefined && options?.body !== null;
  const serverUrl = getRuntimeServerUrl();
  const requestUrl = getApiUrl(url, serverUrl);
  let res: Response;

  try {
    res = await fetch(requestUrl, {
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers ?? {}),
      },
      ...options,
    });
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error(formatServerUnavailableMessage(serverUrl));
    }

    throw error;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return responseSchema ? responseSchema.parse(data) : (data as T);
}
