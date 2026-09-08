// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import * as serverConfig from "@/shared/runtime/serverConfig";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { AppConfigStatus } from "@telegram-star/shared/contracts/config";
import { useSettingsForm } from "./useSettingsForm";

function createConfig(patch: Partial<AppConfigStatus> = {}): AppConfigStatus {
  return {
    telegram: {
      telegramConfigured: true,
      telegramConfigSource: "database",
      databaseConfigured: true,
      apiId: 12345,
      apiHashMasked: "ab***cd",
    },
    media: { thumbIndex: 1, thumbQuality: "medium" },
    ...patch,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useSettingsForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads the current server's config without exposing its saved hash", async () => {
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig());
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.apiId).toBe("12345");
    expect(result.current.apiHash).toBe("");
    expect(result.current.thumbIndex).toBe(1);
    expect(result.current.dirty).toBe(false);
    expect(result.current.loadError).toBeNull();
  });

  it("saves media alone even when Telegram credentials are missing and preserves that draft", async () => {
    const initial = createConfig({
      telegram: {
        telegramConfigured: false, telegramConfigSource: "missing",
        databaseConfigured: false, apiId: null, apiHashMasked: null,
      },
    });
    vi.spyOn(api.config, "get").mockResolvedValue(initial);
    const update = vi.spyOn(api.config, "update").mockResolvedValue(createConfig({
      ...initial, media: { thumbIndex: 2, thumbQuality: "high" },
    }));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: false }), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiId("unfinished");
      result.current.setApiHash("not-yet-saved");
      result.current.setThumbIndex(2);
    });
    await act(async () => { await result.current.handleSave("media"); });

    expect(update).toHaveBeenCalledWith({ media: { thumbIndex: 2 } });
    expect(result.current.apiId).toBe("unfinished");
    expect(result.current.apiHash).toBe("not-yet-saved");
    expect(result.current.telegramDirty).toBe(true);
    expect(result.current.mediaDirty).toBe(false);
    expect(result.current.telegramFieldErrors).toEqual({});
    expect(result.current.mediaNotice).toBe("媒体设置已保存");
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.auth.status });
  });

  it("saves Telegram alone while keeping an unsaved media choice", async () => {
    const initial = createConfig();
    const saved = createConfig({ telegram: { ...initial.telegram, apiId: 67890 } });
    vi.spyOn(api.config, "get").mockResolvedValue(initial);
    const update = vi.spyOn(api.config, "update").mockResolvedValue(saved);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiId(" 67890 ");
      result.current.setApiHash(" new-hash ");
      result.current.setThumbIndex(2);
    });
    await act(async () => { await result.current.handleSave("telegram"); });

    expect(update).toHaveBeenCalledWith({ telegram: { apiId: "67890", apiHash: "new-hash" } });
    expect(queryClient.getQueryData(queryKeys.config.status)).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.status });
    expect(result.current.apiId).toBe("67890");
    expect(result.current.apiHash).toBe("");
    expect(result.current.telegramDirty).toBe(false);
    expect(result.current.thumbIndex).toBe(2);
    expect(result.current.mediaDirty).toBe(true);
    expect(result.current.telegramNotice).toBe("Telegram 设置已保存");
    expect(result.current.mediaNotice).toBeNull();
  });

  it("discards only the selected section", async () => {
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig());
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiId("67890");
      result.current.setApiHash("draft-hash");
      result.current.setThumbIndex(2);
      result.current.resetDraft("media");
    });
    expect(result.current.thumbIndex).toBe(1);
    expect(result.current.apiId).toBe("67890");
    expect(result.current.apiHash).toBe("draft-hash");

    act(() => {
      result.current.setThumbIndex(0);
      result.current.resetDraft("telegram");
    });
    expect(result.current.apiId).toBe("12345");
    expect(result.current.apiHash).toBe("");
    expect(result.current.thumbIndex).toBe(0);
    expect(result.current.mediaDirty).toBe(true);
  });

  it("keeps both drafts through a background refresh and resets against the latest server values", async () => {
    const initial = createConfig();
    const refreshed = createConfig({
      telegram: { ...initial.telegram, apiId: 33333 },
      media: { thumbIndex: 0, thumbQuality: "low" },
    });
    const get = vi.spyOn(api.config, "get").mockResolvedValue(initial);
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiId("67890");
      result.current.setApiHash("draft-hash");
      result.current.setThumbIndex(2);
    });
    get.mockResolvedValue(refreshed);
    act(() => result.current.loadStatus());
    await waitFor(() => expect(result.current.status?.apiId).toBe(33333));
    expect(result.current.apiId).toBe("67890");
    expect(result.current.apiHash).toBe("draft-hash");
    expect(result.current.thumbIndex).toBe(2);

    act(() => result.current.resetDraft("telegram"));
    expect(result.current.apiId).toBe("33333");
    expect(result.current.apiHash).toBe("");
    expect(result.current.thumbIndex).toBe(2);
    act(() => result.current.resetDraft("media"));
    expect(result.current.thumbIndex).toBe(0);
  });

  it("validates Telegram fields locally and requires a hash when replacing environment credentials", async () => {
    const initial = createConfig();
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig({
      telegram: { ...initial.telegram, telegramConfigSource: "env", databaseConfigured: false },
    }));
    const update = vi.spyOn(api.config, "update").mockResolvedValue(initial);
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: false }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setApiId(""));
    await act(async () => { await result.current.handleSave("telegram"); });
    expect(result.current.telegramFieldErrors.apiId).toBe("请输入 API ID");
    expect(result.current.telegramFieldErrors.apiHash).toBe("首次保存到数据库需填写 API Hash");
    act(() => result.current.setApiId("1.5"));
    await act(async () => { await result.current.handleSave("telegram"); });
    expect(result.current.telegramFieldErrors.apiId).toBe("API ID 必须是正整数");
    expect(update).not.toHaveBeenCalled();

    act(() => {
      result.current.setApiId("12345");
      result.current.setApiHash("fresh-hash");
    });
    await act(async () => { await result.current.handleSave("telegram"); });
    expect(update).toHaveBeenCalledWith({ telegram: { apiId: "12345", apiHash: "fresh-hash" } });
    expect(result.current.telegramFieldErrors).toEqual({});
  });

  it("keeps the database hash by submitting an empty hash", async () => {
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig());
    const update = vi.spyOn(api.config, "update").mockResolvedValue(createConfig());
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.handleSave("telegram"); });
    expect(update).toHaveBeenCalledWith({ telegram: { apiId: "12345", apiHash: "" } });
  });

  it.each(["apiId", "apiHash"] as const)("preserves newer %s edits when an earlier Telegram save completes", async (field) => {
    const initial = createConfig();
    const saving = deferred<AppConfigStatus>();
    vi.spyOn(api.config, "get").mockResolvedValue(initial);
    vi.spyOn(api.config, "update").mockReturnValue(saving.promise);
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiId("67890");
      result.current.setApiHash("submitted-hash");
      result.current.setThumbIndex(2);
    });
    let request!: Promise<void>;
    act(() => { request = result.current.handleSave("telegram"); });
    await waitFor(() => expect(result.current.savingSection).toBe("telegram"));
    act(() => {
      if (field === "apiId") result.current.setApiId("99999");
      else result.current.setApiHash("newer-hash");
    });
    await act(async () => {
      saving.resolve(createConfig({ telegram: { ...initial.telegram, apiId: 67890 } }));
      await request;
    });

    expect(result.current.apiId).toBe(field === "apiId" ? "99999" : "67890");
    expect(result.current.apiHash).toBe(field === "apiHash" ? "newer-hash" : "");
    expect(result.current.telegramDirty).toBe(true);
    expect(result.current.thumbIndex).toBe(2);
    expect(result.current.telegramNotice).toBe("已保存提交的版本");
    expect(result.current.savingSection).toBeNull();
  });

  it("preserves a newer media selection and prevents concurrent duplicate saves", async () => {
    const saving = deferred<AppConfigStatus>();
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig());
    const update = vi.spyOn(api.config, "update").mockReturnValue(saving.promise);
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setThumbIndex(2));
    let request!: Promise<void>;
    act(() => {
      request = result.current.handleSave("media");
      void result.current.handleSave("media");
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    act(() => result.current.setThumbIndex(0));
    await act(async () => {
      saving.resolve(createConfig({ media: { thumbIndex: 2, thumbQuality: "high" } }));
      await request;
    });
    expect(result.current.thumbIndex).toBe(0);
    expect(result.current.mediaDirty).toBe(true);
    expect(result.current.mediaNotice).toBe("已保存提交的版本");
  });

  it("keeps errors and unsaved edits in their own section after a failed save", async () => {
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig());
    vi.spyOn(api.config, "update").mockRejectedValue(new Error("服务器暂时不可用"));
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiHash("draft");
      result.current.setThumbIndex(2);
    });
    await act(async () => { await result.current.handleSave("media"); });
    expect(result.current.mediaError).toBe("服务器暂时不可用");
    expect(result.current.telegramError).toBeNull();
    expect(result.current.apiHash).toBe("draft");
    expect(result.current.thumbIndex).toBe(2);
    expect(result.current.saving).toBe(false);
    act(() => result.current.resetDraft("telegram"));
    expect(result.current.mediaError).toBe("服务器暂时不可用");
  });

  it("isolates changed server scopes, loading states, and late save responses", async () => {
    const first = createConfig();
    const second = createConfig({ telegram: { ...first.telegram, apiId: 88888 } });
    const newServer = deferred<AppConfigStatus>();
    const oldSave = deferred<AppConfigStatus>();
    vi.spyOn(api.config, "get").mockResolvedValueOnce(first).mockReturnValue(newServer.promise);
    const update = vi.spyOn(api.config, "update").mockReturnValue(oldSave.promise);
    const queryClient = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }) => useSettingsForm({ telegramAuthorized: true, serverScope: scope }),
      { initialProps: { scope: "server-a" }, wrapper: createQueryWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setApiId("67890");
      result.current.setApiHash("old-server-draft");
      result.current.setThumbIndex(2);
    });
    let request!: Promise<void>;
    act(() => { request = result.current.handleSave("telegram"); });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    rerender({ scope: "server-b" });
    expect(result.current.status).toBeNull();
    expect(result.current.apiId).toBe("");
    expect(result.current.apiHash).toBe("");
    expect(result.current.loading).toBe(true);
    expect(result.current.dirty).toBe(false);
    await act(async () => { await result.current.handleSave("media"); });
    expect(update).toHaveBeenCalledTimes(1);

    await act(async () => { newServer.resolve(second); });
    await waitFor(() => expect(result.current.apiId).toBe("88888"));
    act(() => result.current.setApiHash("new-server-draft"));
    await act(async () => {
      oldSave.resolve(createConfig({ telegram: { ...first.telegram, apiId: 67890 } }));
      await request;
    });
    expect(result.current.apiId).toBe("88888");
    expect(result.current.apiHash).toBe("new-server-draft");
    expect(result.current.telegramNotice).toBeNull();
    expect(queryClient.getQueryData([...queryKeys.config.status, "server-b"])).toEqual(second);
    expect(queryClient.getQueryData(queryKeys.config.status)).toBeUndefined();
  });

  it("does not overwrite the shared cache if another page switches server after unmount", async () => {
    const runtime = vi.spyOn(serverConfig, "getRuntimeServerUrl").mockReturnValue("first-server");
    const saving = deferred<AppConfigStatus>();
    const first = createConfig();
    vi.spyOn(api.config, "get").mockResolvedValue(first);
    vi.spyOn(api.config, "update").mockReturnValue(saving.promise);
    const queryClient = createTestQueryClient();
    const { result, unmount } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let request!: Promise<void>;
    act(() => { request = result.current.handleSave("media"); });
    await waitFor(() => expect(result.current.saving).toBe(true));
    unmount();
    runtime.mockReturnValue("second-server");
    const second = createConfig({ telegram: { ...first.telegram, apiId: 99999 } });
    queryClient.setQueryData(queryKeys.config.status, second);

    await act(async () => { saving.resolve(first); await request; });
    expect(queryClient.getQueryData(queryKeys.config.status)).toEqual(second);
    expect(queryClient.getQueryData([...queryKeys.config.status, "first-server"])).toEqual(first);
  });

  it("does not refill an old server's key when address saving invalidates before rerender", async () => {
    const runtime = vi.spyOn(serverConfig, "getRuntimeServerUrl").mockReturnValue("first-server");
    const first = createConfig();
    const second = createConfig({ telegram: { ...first.telegram, apiId: 99999 } });
    const get = vi.spyOn(api.config, "get").mockResolvedValue(first);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    runtime.mockReturnValue("second-server");
    get.mockResolvedValue(second);
    await act(async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.config.status }); });
    await waitFor(() => expect(result.current.apiId).toBe("99999"));
    expect(queryClient.getQueryData([...queryKeys.config.status, "first-server"])).toEqual(first);
    expect(queryClient.getQueryData([...queryKeys.config.status, "second-server"])).toEqual(second);
  });
});
