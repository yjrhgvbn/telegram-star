import type { ZodType } from "zod";

const BASE = "/api";

export async function request<T>(
  url: string,
  options?: RequestInit,
  responseSchema?: ZodType<T>,
): Promise<T> {
  const hasBody = options?.body !== undefined && options?.body !== null;
  const res = await fetch(`${BASE}${url}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return responseSchema ? responseSchema.parse(data) : (data as T);
}
