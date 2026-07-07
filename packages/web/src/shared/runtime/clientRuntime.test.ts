import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_DEVICE_ID_STORAGE_KEY,
  buildClientRegisterInput,
  detectClientOs,
  detectClientRuntime,
  getClientDeviceId,
} from "./clientRuntime";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("client runtime", () => {
  it("detects browser and pwa runtime capabilities", () => {
    expect(detectClientRuntime({ standalone: false, notificationSupported: true })).toMatchObject({
      type: "web",
      platform: "browser",
      capabilities: {
        nativeNotification: true,
        secureStorage: false,
        tray: false,
      },
    });

    expect(detectClientRuntime({ standalone: true })).toMatchObject({
      type: "pwa",
      platform: "browser",
      capabilities: {
        backgroundRefresh: true,
      },
    });
  });

  it("detects Tauri desktop before display mode", () => {
    expect(detectClientRuntime({ standalone: true, tauriAvailable: true })).toMatchObject({
      type: "desktop",
      platform: "tauri",
      capabilities: {
        tray: true,
        appUpdater: true,
      },
    });
  });

  it("detects Tauri mobile by mobile operating systems", () => {
    expect(detectClientRuntime({
      tauriAvailable: true,
      userAgent: "Mozilla/5.0 (iPhone)",
    })).toMatchObject({
      type: "mobile",
      platform: "tauri",
      os: "ios",
      capabilities: {
        scanQrCode: true,
        tray: false,
        appUpdater: false,
      },
    });
  });

  it("detects common operating systems", () => {
    expect(detectClientOs("Mozilla/5.0 (Macintosh)", "MacIntel")).toBe("macos");
    expect(detectClientOs("Mozilla/5.0 (iPhone)", "")).toBe("ios");
    expect(detectClientOs("Mozilla/5.0 (Windows NT 10.0)", "Win32")).toBe("windows");
    expect(detectClientOs("Mozilla/5.0 (Android 15)", "")).toBe("android");
  });

  it("persists generated client ids when storage is available", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("client-1" as `${string}-${string}-${string}-${string}-${string}`);
    const storage = createMemoryStorage();

    expect(getClientDeviceId(storage)).toBe("client-1");
    expect(storage.getItem(CLIENT_DEVICE_ID_STORAGE_KEY)).toBe("client-1");
    expect(getClientDeviceId(storage)).toBe("client-1");
  });

  it("builds a register payload from runtime data", () => {
    const input = buildClientRegisterInput("client-1", {
      type: "web",
      platform: "browser",
      os: "macos",
      appVersion: "1.0.0",
      capabilities: {
        nativeNotification: false,
        secureStorage: false,
        openExternal: true,
        scanQrCode: false,
        backgroundRefresh: false,
        tray: false,
        appUpdater: false,
      },
    });

    expect(input).toMatchObject({
      clientId: "client-1",
      type: "web",
      platform: "browser",
      os: "macos",
    });
  });
});
