// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import { ACCESS_REQUIRED_EVENT, clearAccessSession, getAccessSession, saveAccessSession } from "@/shared/runtime/accessSession";
import { clearSavedServerUrl, saveServerUrl } from "@/shared/runtime/serverConfig";
import { AppAccessGate } from "./AppAccessGate";

afterEach(() => { cleanup(); clearAccessSession(); clearAccessSession("https://a.example"); clearAccessSession("https://b.example"); clearSavedServerUrl(); vi.unstubAllGlobals(); });
it("opens the workspace directly and clears stale credentials when password protection is disabled", async () => {
  const expiresAt = Date.now() + 60_000;
  saveAccessSession({ token: "old-session", expiresAt, assetToken: "old-asset", assetExpiresAt: expiresAt });
  const fetcher = vi.fn(async () => Response.json({ required: false, authorized: true }));
  vi.stubGlobal("fetch", fetcher);
  render(<AppAccessGate><p>Private messages</p></AppAccessGate>, { wrapper: createQueryWrapper(createTestQueryClient()) });
  expect(await screen.findByText("Private messages")).toBeTruthy();
  expect(screen.queryByLabelText("后台访问密码")).toBeNull();
  expect(getAccessSession()).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("keeps private UI unmounted until login, then clears it and cached data on lock", async () => {
  let authenticated = false;
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/access/login")) {
      if (JSON.parse(String(options?.body)).password !== "test-password-123456") return new Response('{"error":"密码错误"}', { status: 401 });
      authenticated = true;
      return Response.json({ token: "session", expiresAt: Date.now() + 60_000, assetToken: "asset", assetExpiresAt: Date.now() + 30_000 });
    }
    if (url.endsWith("/access/assets")) return Response.json({ assetToken: "asset", assetExpiresAt: Date.now() + 30_000 });
    return Response.json({ required: true, authorized: authenticated });
  }));
  const client = createTestQueryClient();
  render(<AppAccessGate><p>Private messages</p></AppAccessGate>, { wrapper: createQueryWrapper(client) });
  await waitFor(() => expect((screen.getByRole("button", { name: "连接" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByText("Private messages")).toBeNull();
  await user.type(screen.getByLabelText("后台访问密码"), "wrong");
  await user.click(screen.getByRole("button", { name: "连接" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "密码错误");
  await user.clear(screen.getByLabelText("后台访问密码"));
  await user.type(screen.getByLabelText("后台访问密码"), "test-password-123456");
  await user.click(screen.getByRole("button", { name: "连接" }));
  expect(await screen.findByText("Private messages")).toBeTruthy();
  expect(getAccessSession()?.token).toBe("session");
  client.setQueryData(["private"], { message: "secret" });
  act(() => { window.dispatchEvent(new Event(ACCESS_REQUIRED_EVENT)); });
  expect(screen.queryByText("Private messages")).toBeNull();
  expect(client.getQueryData(["private"])).toBeUndefined();
  expect(getAccessSession()).toBeNull();
});


it("discards an old server's asset refresh instead of copying its management token to the new server", async () => {
  const a = "https://a.example", b = "https://b.example";
  const expiresAt = Date.now() + 60_000;
  saveAccessSession({ token: "a-secret", expiresAt, assetToken: "a-asset", assetExpiresAt: expiresAt }, a);
  saveAccessSession({ token: "b-secret", expiresAt, assetToken: "b-asset", assetExpiresAt: expiresAt }, b);
  saveServerUrl(a);
  let finishA!: (response: Response) => void;
  const fetcher = vi.fn(async (url: string) => {
    if (url === `${a}/api/access/assets`) return new Promise<Response>(resolve => { finishA = resolve; });
    if (url.endsWith("/access/assets")) return Response.json({ assetToken: "b-new-asset", assetExpiresAt: expiresAt });
    return Response.json({ required: true, authorized: true });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AppAccessGate><p>Private messages</p></AppAccessGate>, { wrapper: createQueryWrapper(createTestQueryClient()) });
  await waitFor(() => expect(finishA).toBeTypeOf("function"));
  act(() => saveServerUrl(b));
  expect(await screen.findByText("Private messages")).toBeTruthy();
  await act(async () => { finishA(Response.json({ assetToken: "a-new-asset", assetExpiresAt: expiresAt })); });
  expect(getAccessSession(b)).toMatchObject({ token: "b-secret", assetToken: "b-new-asset" });
  expect(getAccessSession(a)).toMatchObject({ token: "a-secret", assetToken: "a-asset" });
});

it("discards a login result after the user changes servers while login is pending", async () => {
  const a = "https://a.example", b = "https://b.example";
  saveServerUrl(a);
  let finishLogin!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `${a}/api/access/login`) return new Promise<Response>(resolve => { finishLogin = resolve; });
    return Response.json({ required: true, authorized: false });
  }));
  const user = userEvent.setup();
  render(<AppAccessGate><p>Private messages</p></AppAccessGate>, { wrapper: createQueryWrapper(createTestQueryClient()) });
  await waitFor(() => expect((screen.getByRole("button", { name: "连接" }) as HTMLButtonElement).disabled).toBe(false));
  await user.type(screen.getByLabelText("后台访问密码"), "password-for-a");
  await user.click(screen.getByRole("button", { name: "连接" }));
  await waitFor(() => expect(finishLogin).toBeTypeOf("function"));
  act(() => saveServerUrl(b));
  const expiresAt = Date.now() + 60_000;
  await act(async () => { finishLogin(Response.json({ token: "a-secret", expiresAt, assetToken: "a-asset", assetExpiresAt: expiresAt })); });
  expect(getAccessSession(a)).toBeNull();
  expect(getAccessSession(b)).toBeNull();
  expect(screen.queryByText("Private messages")).toBeNull();
  expect((screen.getByLabelText("服务器地址") as HTMLInputElement).value).toBe(b);
});

it("does not clear the new server session when an old unauthorized status response arrives late", async () => {
  const a = "https://a.example", b = "https://b.example";
  saveServerUrl(a);
  const expiresAt = Date.now() + 60_000;
  saveAccessSession({ token: "b-secret", expiresAt, assetToken: "b-asset", assetExpiresAt: expiresAt }, b);
  let finishStatus!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `${a}/api/access/status`) return new Promise<Response>(resolve => { finishStatus = resolve; });
    if (url.endsWith("/access/assets")) return Response.json({ assetToken: "b-new", assetExpiresAt: expiresAt });
    return Response.json({ required: true, authorized: true });
  }));
  render(<AppAccessGate><p>Private messages</p></AppAccessGate>, { wrapper: createQueryWrapper(createTestQueryClient()) });
  await waitFor(() => expect(finishStatus).toBeTypeOf("function"));
  act(() => saveServerUrl(b));
  expect(await screen.findByText("Private messages")).toBeTruthy();
  await act(async () => { finishStatus(Response.json({ required: true, authorized: false })); });
  expect(getAccessSession(b)?.token).toBe("b-secret");
  expect(screen.queryByText("Private messages")).toBeTruthy();
});
