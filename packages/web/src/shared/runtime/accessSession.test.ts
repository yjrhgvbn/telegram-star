// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessSession, saveAccessSession, clearAccessSession, withAssetAccess, ACCESS_REQUIRED_EVENT } from "./accessSession";
import { clearSavedServerUrl, saveServerUrl } from "./serverConfig";
import { request } from "../api/request";

const a = "https://a.example", b = "https://b.example";
const session = () => ({ token: "management-secret", expiresAt: Date.now() + 10_000, assetToken: "limited-ticket", assetExpiresAt: Date.now() + 5_000 });
afterEach(() => { clearAccessSession(a); clearAccessSession(b); clearSavedServerUrl(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("backend access sessions", () => {
  it("isolates credentials by server and uses only the limited ticket in resource URLs", async () => {
    saveAccessSession(session(), `${a}/api/`);
    expect(getAccessSession(a)?.token).toBe("management-secret");
    expect(getAccessSession(b)).toBeNull();
    expect(withAssetAccess(`${a}/api/messages/events`, a)).toContain("asset_token=limited-ticket");
    expect(withAssetAccess(`${b}/api/messages/events`, b)).not.toContain("token");
    saveServerUrl(a);
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await request("/filters", { headers: new Headers({ Accept: "application/json" }) });
    const [, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer management-secret");
    expect(headers.get("Accept")).toBe("application/json");
    saveServerUrl(b);
    await request("/filters");
    const [, other] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(other.headers).has("Authorization")).toBe(false);
  });

  it("rejects expired sessions and asks the app to lock on business API 401", async () => {
    saveAccessSession({ ...session(), expiresAt: Date.now() - 1 }, a);
    expect(getAccessSession(a)).toBeNull();
    const locked = vi.fn();
    window.addEventListener(ACCESS_REQUIRED_EVENT, locked);
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"Unauthorized"}', { status: 401 })));
    try {
      await expect(request("/config")).rejects.toThrow("Unauthorized");
      expect(locked).toHaveBeenCalledOnce();
      await expect(request("/access/login")).rejects.toThrow("Unauthorized");
      expect(locked).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(ACCESS_REQUIRED_EVENT, locked); }
  });
});


it("binds explicit requests to their server and ignores a previous server's late 401", async () => {
  saveAccessSession(session(), a);
  saveServerUrl(a);
  let finish!: (response: Response) => void;
  const fetcher = vi.fn((_url: string) => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const locked = vi.fn();
  window.addEventListener(ACCESS_REQUIRED_EVENT, locked);
  try {
    const old = request("/filters");
    saveServerUrl(b);
    finish(new Response('{"error":"old server unauthorized"}', { status: 401 }));
    await expect(old).rejects.toThrow("old server unauthorized");
    expect(locked).not.toHaveBeenCalled();
    fetcher.mockImplementation(async () => Response.json({}));
    await request("/filters", undefined, undefined, a);
    const [url, options] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(`${a}/api/filters`);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer management-secret");
  } finally { window.removeEventListener(ACCESS_REQUIRED_EVENT, locked); }
});

it("ignores an old session's late 401 after a fresh login on the same server", async () => {
  saveServerUrl(a);
  saveAccessSession(session(), a);
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const locked = vi.fn();
  window.addEventListener(ACCESS_REQUIRED_EVENT, locked);
  try {
    const old = request("/filters");
    saveAccessSession({ ...session(), token: "new-session" }, a);
    finish(new Response('{"error":"old token expired"}', { status: 401 }));
    await expect(old).rejects.toThrow("old token expired");
    expect(locked).not.toHaveBeenCalled();
    expect(getAccessSession(a)?.token).toBe("new-session");
  } finally { window.removeEventListener(ACCESS_REQUIRED_EVENT, locked); }
});
