import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAccessConfiguration, registerAccessProtection } from "./access.js";

const password = "only-an-isolated-test-password";
const apps: ReturnType<typeof Fastify>[] = [];
function makeApp(secret = password) {
  const app = Fastify();
  apps.push(app);
  registerAccessProtection(app, secret);
  app.get("/api/private", async () => ({ ok: true }));
  app.post("/api/private", async () => ({ ok: true }));
  app.get("/api/messages/1/avatar", async () => "image");
  return app;
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(apps.splice(0).map(app => app.close())); });

describe("application access protection", () => {
  it("allows direct reads, writes and media when no password is configured", async () => {
    const app = makeApp("");
    expect((await app.inject("/api/access/status")).json()).toEqual({ required: false, authorized: true });
    expect((await app.inject("/api/private")).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/private" })).statusCode).toBe(200);
    expect((await app.inject("/api/messages/1/avatar")).statusCode).toBe(200);
  });
  it("requires authentication for reads and writes and limits asset tickets to read-only media", async () => {
    const app = makeApp();
    expect((await app.inject("/api/private")).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/private" })).statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/api/access/login", payload: { password } });
    expect(login.statusCode).toBe(200);
    const { token, assetToken } = login.json();
    expect((await app.inject({ url: "/api/private", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await app.inject(`/api/messages/1/avatar?asset_token=${assetToken}`)).statusCode).toBe(200);
    expect((await app.inject(`/api/private?asset_token=${assetToken}`)).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/api/private?asset_token=${assetToken}` })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/private", headers: { authorization: `Bearer ${token}x` } })).statusCode).toBe(401);
  });
  it("expires sessions and invalidates them when the configured password changes", async () => {
    const app = makeApp();
    const { token, expiresAt } = (await app.inject({ method: "POST", url: "/api/access/login", payload: { password } })).json();
    expect((await makeApp(password + "new").inject({ url: "/api/private", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
    expect((await app.inject({ url: "/api/private", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });
  it("rate limits wrong passwords", async () => {
    const app = makeApp();
    for (let i=0;i<10;i++) expect((await app.inject({ method: "POST", url: "/api/access/login", payload: { password: "wrong" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/access/login", payload: { password: "wrong" } })).statusCode).toBe(429);
  });
  it("only validates password length when protection is enabled", () => {
    expect(() => assertAccessConfiguration("short")).toThrow("16");
    expect(() => assertAccessConfiguration("")).not.toThrow();
    expect(() => assertAccessConfiguration(password)).not.toThrow();
  });
});
