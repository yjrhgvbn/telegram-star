import { describe, expect, it, vi } from "vitest";
import {
  buildMobileCapabilities,
  getMobileClientId,
  registerMobileClient,
} from "./clientDevice";
import { MOBILE_CLIENT_ID_STORAGE_KEY } from "./serverConfig";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("mobile client device", () => {
  it("builds mobile capabilities with push reserved", () => {
    expect(buildMobileCapabilities()).toMatchObject({
      scanQrCode: true,
      backgroundRefresh: true,
      tray: false,
      appUpdater: false,
    });
  });

  it("persists a mobile client id", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("mobile-1" as `${string}-${string}-${string}-${string}-${string}`);
    const storage = new MemoryStorage();

    expect(getMobileClientId(storage)).toBe("mobile-1");
    expect(storage.getItem(MOBILE_CLIENT_ID_STORAGE_KEY)).toBe("mobile-1");
    expect(getMobileClientId(storage)).toBe("mobile-1");
  });

  it("registers the mobile shell against the configured backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "mobile-1",
          name: "iPhone · mobile",
          type: "mobile",
          platform: "tauri",
          os: "ios",
          appVersion: "0.1.0",
          capabilities: buildMobileCapabilities(),
          lastSeenAt: "2026-07-02T00:00:00.000Z",
          createdAt: "2026-07-02T00:00:00.000Z",
          revokedAt: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone" });

    await expect(registerMobileClient("https://star.example.com/api", "mobile-1")).resolves.toMatchObject({
      id: "mobile-1",
      type: "mobile",
      platform: "tauri",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://star.example.com/api/clients/register",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      clientId: "mobile-1",
      type: "mobile",
      platform: "tauri",
      os: "ios",
      capabilities: {
        scanQrCode: true,
      },
    });
  });
});
