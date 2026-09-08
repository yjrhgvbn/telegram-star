import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { messageAvatarRoutes } from "./messageAvatar.routes.js";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({ db: { message: { findUnique: mocks.findUnique } } }));
vi.mock("../../services/telegram/client.js", () => ({
  getClient: mocks.getClient,
  isClientConnected: () => true,
}));

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

describe("message avatar route", () => {
  const downloadProfilePhoto = vi.fn();

  beforeEach(() => {
    mocks.findUnique.mockReset().mockResolvedValue({ chatId: "42" });
    downloadProfilePhoto.mockReset().mockResolvedValue(jpeg);
    // Each test uses a new client identity, as a real login does.
    mocks.getClient.mockReturnValue({
      getDialogs: vi.fn().mockResolvedValue([{ entity: { className: "Channel", id: "42" } }]),
      downloadProfilePhoto,
    });
  });

  it("looks up the stored source and returns a private raster image", async () => {
    const app = await createRouteTestApp(messageAvatarRoutes);
    const response = await app.inject({ method: "GET", url: "/api/messages/7/avatar?peer=999&role=sender" });
    await app.close();

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { chatId: true } });
    expect(downloadProfilePhoto).toHaveBeenCalledWith(
      { className: "Channel", id: "42" },
      { isBig: false },
    );
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(jpeg);
    expect(response.headers["content-type"]).toBe("image/jpeg");
    expect(response.headers["content-length"]).toBe(String(jpeg.length));
    expect(response.headers["cache-control"]).toBe("private, no-cache");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it.each(["0", "-1", "1.5", "nope", "1abc"])("rejects invalid stored message id %s", async (id) => {
    const app = await createRouteTestApp(messageAvatarRoutes);
    const response = await app.inject({ method: "GET", url: `/api/messages/${id}/avatar` });
    await app.close();
    expect(response.statusCode).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(downloadProfilePhoto).not.toHaveBeenCalled();
  });

  it("does not query Telegram for a message absent from storage", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const app = await createRouteTestApp(messageAvatarRoutes);
    const response = await app.inject({ method: "GET", url: "/api/messages/999/avatar" });
    await app.close();
    expect(response.statusCode).toBe(404);
    expect(parseJson(response.payload)).toEqual({ error: "Avatar not available" });
    expect(downloadProfilePhoto).not.toHaveBeenCalled();
  });

  it("shares a downloaded source avatar across different collected messages", async () => {
    const app = await createRouteTestApp(messageAvatarRoutes);
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/messages/7/avatar" }),
      app.inject({ method: "GET", url: "/api/messages/8/avatar" }),
    ]);
    await app.close();
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
    expect(downloadProfilePhoto).toHaveBeenCalledTimes(1);
  });

  it.each(["empty", "Telegram failure", "storage failure"])("returns an opaque 404 for %s", async (mode) => {
    if (mode === "empty") downloadProfilePhoto.mockResolvedValue(Buffer.alloc(0));
    else if (mode === "Telegram failure") downloadProfilePhoto.mockRejectedValue(new Error("access_hash secret"));
    else mocks.findUnique.mockRejectedValue(new Error("database path secret"));
    const app = await createRouteTestApp(messageAvatarRoutes);
    const response = await app.inject({ method: "GET", url: "/api/messages/7/avatar" });
    await app.close();
    expect(response.statusCode).toBe(404);
    expect(parseJson(response.payload)).toEqual({ error: "Avatar not available" });
    expect(response.headers["cache-control"]).toBe("private, no-cache");
  });
});
