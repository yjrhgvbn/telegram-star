import type { ClientDevice } from "@telegram-star/shared/contracts/clients";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { clientsRoutes } from "./clients.routes.js";
import * as clientsService from "./clients.service.js";

vi.mock("./clients.service.js", () => {
  class ClientDeviceNotFoundError extends Error {
    constructor() {
      super("Client device not found");
    }
  }

  return {
    ClientDeviceNotFoundError,
    deleteClientDevice: vi.fn(),
    heartbeatClientDevice: vi.fn(),
    listClientDevices: vi.fn(),
    registerClientDevice: vi.fn(),
  };
});

const capabilities = {
  nativeNotification: false,
  secureStorage: false,
  openExternal: true,
  scanQrCode: false,
  backgroundRefresh: false,
  tray: false,
  appUpdater: false,
};

function createDevice(id: string, patch: Partial<ClientDevice> = {}): ClientDevice {
  return {
    id,
    name: `device-${id}`,
    type: "web",
    platform: "browser",
    os: "macos",
    appVersion: "1.0.0",
    capabilities,
    lastSeenAt: "2026-07-01T12:00:00.000Z",
    createdAt: "2026-07-01T12:00:00.000Z",
    revokedAt: null,
    ...patch,
  };
}

describe("clients routes", () => {
  beforeEach(() => {
    vi.mocked(clientsService.deleteClientDevice).mockReset();
    vi.mocked(clientsService.heartbeatClientDevice).mockReset();
    vi.mocked(clientsService.listClientDevices).mockReset();
    vi.mocked(clientsService.registerClientDevice).mockReset();
  });

  it("lists devices with the mounted prefix", async () => {
    const devices = [createDevice("client-1")];
    vi.mocked(clientsService.listClientDevices).mockResolvedValue(devices);
    const app = await createRouteTestApp((fastify) =>
      fastify.register(clientsRoutes, { prefix: "/api/clients" }),
    );

    const response = await app.inject({ method: "GET", url: "/api/clients" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(devices);
  });

  it("validates and registers a client device", async () => {
    const device = createDevice("client-1", { type: "pwa" });
    vi.mocked(clientsService.registerClientDevice).mockResolvedValue(device);
    const app = await createRouteTestApp((fastify) =>
      fastify.register(clientsRoutes, { prefix: "/api/clients" }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/clients/register",
      payload: {
        clientId: "client-1",
        name: "MacBook · PWA",
        type: "pwa",
        platform: "browser",
        os: "macos",
        appVersion: "1.0.0",
        capabilities,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(clientsService.registerClientDevice).toHaveBeenCalledWith({
      clientId: "client-1",
      name: "MacBook · PWA",
      type: "pwa",
      platform: "browser",
      os: "macos",
      appVersion: "1.0.0",
      capabilities,
    });
  });

  it("rejects invalid register payloads", async () => {
    const app = await createRouteTestApp((fastify) =>
      fastify.register(clientsRoutes, { prefix: "/api/clients" }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/clients/register",
      payload: {
        clientId: "",
        name: "",
        type: "unknown",
        platform: "browser",
        capabilities,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(clientsService.registerClientDevice).not.toHaveBeenCalled();
  });

  it("updates heartbeat and deletes devices", async () => {
    vi.mocked(clientsService.heartbeatClientDevice).mockResolvedValue({
      success: true,
      lastSeenAt: "2026-07-01T12:01:00.000Z",
    });
    vi.mocked(clientsService.deleteClientDevice).mockResolvedValue({ success: true });
    const app = await createRouteTestApp((fastify) =>
      fastify.register(clientsRoutes, { prefix: "/api/clients" }),
    );

    const heartbeatResponse = await app.inject({
      method: "PATCH",
      url: "/api/clients/client-1/heartbeat",
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/clients/client-1",
    });
    await app.close();

    expect(heartbeatResponse.statusCode).toBe(200);
    expect(deleteResponse.statusCode).toBe(200);
    expect(clientsService.heartbeatClientDevice).toHaveBeenCalledWith("client-1");
    expect(clientsService.deleteClientDevice).toHaveBeenCalledWith("client-1");
  });

  it("maps missing devices to 404", async () => {
    vi.mocked(clientsService.heartbeatClientDevice).mockRejectedValue(
      new clientsService.ClientDeviceNotFoundError(),
    );
    const app = await createRouteTestApp((fastify) =>
      fastify.register(clientsRoutes, { prefix: "/api/clients" }),
    );

    const response = await app.inject({
      method: "PATCH",
      url: "/api/clients/missing/heartbeat",
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(parseJson(response.payload)).toEqual({ error: "Client device not found" });
  });
});
