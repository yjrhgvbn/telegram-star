// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientDevice } from "@/types";
import { queryKeys } from "@/shared/query/queryKeys";
import { saveServerUrl } from "@/shared/runtime/serverConfig";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import { useClientDeviceDeletion, useClientDevices } from "./useClientDevices";

const api = vi.hoisted(() => ({ list: vi.fn(), delete: vi.fn() }));
vi.mock("@/shared/api/clients", () => ({ clientsApi: api }));
vi.mock("@/shared/runtime/clientRuntime", () => ({ getClientDeviceId: () => "current" }));

function device(id: string, name = id): ClientDevice {
  return {
    id, name, type: "web", platform: "browser",
    capabilities: { nativeNotification: false, secureStorage: false, openExternal: false, scanQrCode: false, backgroundRefresh: false, tray: false, appUpdater: false },
    lastSeenAt: "2026-09-08T00:00:00.000Z", createdAt: "2026-09-08T00:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  api.list.mockReset().mockResolvedValue([device("current"), device("other")]);
  api.delete.mockReset().mockResolvedValue({ success: true });
  saveServerUrl("https://server-a.example");
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("useClientDevices", () => {
  it("keeps removal busy across instances and remounts, releases failures, and permits retry", async () => {
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.clients.all, [device("current"), device("other")]);
    const wrapper = createQueryWrapper(client);
    const first = renderHook(useClientDevices, { wrapper });
    const observer = renderHook(useClientDeviceDeletion, { wrapper });
    const response = deferred<{ success: boolean }>();
    api.delete.mockReturnValueOnce(response.promise);
    let removal!: Promise<void>;
    act(() => { removal = first.result.current.deleteDevice("other"); });
    const caught = removal.catch((error: Error) => error.message);
    await waitFor(() => expect(observer.result.current).toBe("other"));
    first.unmount();
    const reopened = renderHook(useClientDevices, { wrapper });
    expect(reopened.result.current.deletingId).toBe("other");
    await expect(reopened.result.current.deleteDevice("other")).rejects.toThrow("正在移除");
    expect(api.delete).toHaveBeenCalledTimes(1);
    await act(async () => { response.reject(new Error("移除失败")); await caught; });
    await waitFor(() => expect(reopened.result.current.deletingId).toBeNull());
    expect(client.getQueryData<ClientDevice[]>(queryKeys.clients.all)?.map(item => item.id)).toEqual(["current", "other"]);
    await act(async () => { await reopened.result.current.deleteDevice("other"); });
    expect(api.delete).toHaveBeenCalledTimes(2);
    expect(client.getQueryData<ClientDevice[]>(queryKeys.clients.all)?.map(item => item.id)).toEqual(["current"]);
  });

  it("does not let an old server's deletion edit or cancel the new server's shared device query", async () => {
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.clients.all, [device("other", "server A")]);
    const { result } = renderHook(useClientDevices, { wrapper: createQueryWrapper(client) });
    const response = deferred<{ success: boolean }>();
    api.delete.mockReturnValueOnce(response.promise);
    let removal!: Promise<void>;
    act(() => { removal = result.current.deleteDevice("other"); });
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));

    saveServerUrl("https://server-b.example");
    const newDevices = [device("other", "server B")];
    client.setQueryData(queryKeys.clients.all, newDevices);
    const newResponse = deferred<ClientDevice[]>();
    const newQuery = client.fetchQuery({ queryKey: queryKeys.clients.all, queryFn: () => newResponse.promise, staleTime: 0 });
    await act(async () => { response.resolve({ success: true }); await removal; });
    expect(client.getQueryData(queryKeys.clients.all)).toEqual(newDevices);
    expect(client.getQueryState(queryKeys.clients.all)?.fetchStatus).toBe("fetching");
    await act(async () => { newResponse.resolve([...newDevices, device("new")]); await newQuery; });
    expect(client.getQueryData<ClientDevice[]>(queryKeys.clients.all)?.map(item => item.id)).toEqual(["other", "new"]);
  });

  it("cancels a same-server stale list before committing removal so a late refetch cannot restore the device", async () => {
    const client = createTestQueryClient();
    const oldDevices = [device("current"), device("other")];
    client.setQueryData(queryKeys.clients.all, oldDevices);
    const { result } = renderHook(useClientDevices, { wrapper: createQueryWrapper(client) });
    const oldResponse = deferred<ClientDevice[]>();
    const oldQuery = client.fetchQuery({ queryKey: queryKeys.clients.all, queryFn: () => oldResponse.promise, staleTime: 0 }).catch(() => undefined);
    await act(async () => { await result.current.deleteDevice("other"); });
    await oldQuery;
    await act(async () => { oldResponse.resolve(oldDevices); await oldResponse.promise; });
    expect(client.getQueryData<ClientDevice[]>(queryKeys.clients.all)?.map(item => item.id)).toEqual(["current"]);
  });
});
