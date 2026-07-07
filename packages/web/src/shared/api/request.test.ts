// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSavedServerUrl,
  saveServerUrl,
} from "@/shared/runtime/serverConfig";
import { request } from "./request";

function mockJsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("request", () => {
  afterEach(() => {
    clearSavedServerUrl();
    vi.unstubAllGlobals();
  });

  it("keeps business errors from the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ error: "业务错误" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/config")).rejects.toThrow("业务错误");
    expect(fetchMock).toHaveBeenCalledWith("/api/config", expect.anything());
  });

  it("formats network failures as editable server address errors", async () => {
    saveServerUrl("https://example.com");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(request("/config")).rejects.toThrow(
      "无法连接到后端 https://example.com",
    );
  });
});
