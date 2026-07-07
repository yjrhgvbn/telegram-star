import { describe, expect, it } from "vitest";
import {
  clientDeviceListSchema,
  clientDeviceRegisterInputSchema,
} from "./clients";

const capabilities = {
  nativeNotification: false,
  secureStorage: false,
  openExternal: true,
  scanQrCode: false,
  backgroundRefresh: false,
  tray: false,
  appUpdater: false,
};

describe("clients contract", () => {
  it("accepts a web client registration payload", () => {
    const input = clientDeviceRegisterInputSchema.parse({
      clientId: "client-1",
      name: "Chrome on macOS",
      type: "web",
      platform: "browser",
      os: "macos",
      appVersion: "1.0.0",
      capabilities,
    });

    expect(input.clientId).toBe("client-1");
    expect(input.capabilities.openExternal).toBe(true);
  });

  it("rejects unknown runtime capabilities", () => {
    expect(() =>
      clientDeviceRegisterInputSchema.parse({
        clientId: "client-1",
        name: "Chrome on macOS",
        type: "web",
        platform: "browser",
        capabilities: {
          ...capabilities,
          unknown: true,
        },
      }),
    ).toThrow();
  });

  it("accepts a client device list response", () => {
    const devices = clientDeviceListSchema.parse([
      {
        id: "client-1",
        name: "Chrome on macOS",
        type: "pwa",
        platform: "browser",
        os: "macos",
        appVersion: "1.0.0",
        capabilities,
        lastSeenAt: "2026-07-01T12:00:00.000Z",
        createdAt: "2026-07-01T12:00:00.000Z",
        revokedAt: null,
      },
    ]);

    expect(devices[0].type).toBe("pwa");
  });
});
