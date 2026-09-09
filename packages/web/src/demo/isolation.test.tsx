// @vitest-environment jsdom
import { renderHook, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/demo/mode", () => ({ isDemo: true }));

import { request } from "@/shared/api/request";
import { checkServerHealth } from "@/shared/api/health";
import { getRuntimeServerUrl, saveServerUrl, SERVER_CONFIG_STORAGE_KEY } from "@/shared/runtime/serverConfig";
import { useMessageEvents } from "@/features/messages/hooks/useMessageEvents";
import { useClientDeviceRegistration } from "@/shared/runtime/useClientDeviceRegistration";
import { MessageSourceAvatar } from "@/features/messages/components/MessageSourceAvatar";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("standalone demo isolation", () => {
  it("ignores a saved real server and refuses writes without network fallback", async () => {
    localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, "https://private.example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(getRuntimeServerUrl()).toBe("");
    expect(() => saveServerUrl("https://other.example.com")).toThrow("Demo");
    expect(localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("https://private.example.com");
    await expect(request("/messages/stats", undefined, z.object({ total: z.number() }))).resolves.toEqual({ total: 18 });
    await expect(request("/future-api", { method: "POST" })).rejects.toThrow("Demo");
    await expect(checkServerHealth("https://private.example.com")).rejects.toThrow("Demo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not open an event stream, register devices, or load Telegram avatars", () => {
    const fetchMock = vi.fn();
    const createEventSource = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useMessageEvents({ onNewMessage: vi.fn(), onReadMessages: vi.fn(), createEventSource }));
    renderHook(() => useClientDeviceRegistration());
    const { container } = render(<MessageSourceAvatar messageId={1} source="虚构频道" />);
    expect(createEventSource).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("虚构");
  });
});
