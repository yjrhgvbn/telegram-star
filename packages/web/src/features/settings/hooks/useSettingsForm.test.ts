// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { AppConfigStatus } from "@telegram-star/shared/contracts/config";
import { useSettingsForm } from "./useSettingsForm";

const preventDefaultEvent = {
  preventDefault: vi.fn(),
} as unknown as React.FormEvent;

function createConfig(patch: Partial<AppConfigStatus> = {}): AppConfigStatus {
  return {
    telegram: {
      telegramConfigured: true,
      telegramConfigSource: "database",
      databaseConfigured: true,
      apiId: 12345,
      apiHashMasked: "ab***cd",
    },
    media: {
      thumbIndex: 1,
      thumbQuality: "medium",
    },
    ...patch,
  };
}

describe("useSettingsForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads config into editable form state", async () => {
    vi.spyOn(api.config, "get").mockResolvedValue(createConfig());

    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.apiId).toBe("12345"));

    expect(result.current.apiHash).toBe("");
    expect(result.current.thumbIndex).toBe(1);
    expect(result.current.statusSummary).toEqual({ title: "当前没有失效项", tone: "valid" });
  });

  it("updates config cache and invalidates auth status after saving", async () => {
    const initialConfig = createConfig();
    const savedConfig = createConfig({
      telegram: {
        ...initialConfig.telegram,
        apiId: 67890,
      },
      media: {
        thumbIndex: 2,
        thumbQuality: "high",
      },
    });

    vi.spyOn(api.config, "get").mockResolvedValue(initialConfig);
    const updateSpy = vi.spyOn(api.config, "update").mockResolvedValue(savedConfig);

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: true }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.apiId).toBe("12345"));

    act(() => {
      result.current.setApiId("67890");
      result.current.setApiHash("new-hash");
      result.current.setThumbIndex(2);
    });

    await act(async () => {
      await result.current.handleSave(preventDefaultEvent);
    });

    expect(updateSpy).toHaveBeenCalledWith({
      telegram: {
        apiId: "67890",
        apiHash: "new-hash",
      },
      media: {
        thumbIndex: 2,
      },
    });
    expect(queryClient.getQueryData(queryKeys.config.status)).toEqual(savedConfig);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.auth.status });
    expect(result.current.notice).toBe("设置已保存");
    expect(result.current.apiHash).toBe("");
  });

  it("blocks invalid saves before calling the API", async () => {
    vi.spyOn(api.config, "get").mockResolvedValue(
      createConfig({
        telegram: {
          telegramConfigured: false,
          telegramConfigSource: "missing",
          databaseConfigured: false,
          apiId: null,
          apiHashMasked: null,
        },
      }),
    );
    const updateSpy = vi.spyOn(api.config, "update");

    const { result } = renderHook(() => useSettingsForm({ telegramAuthorized: false }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSave(preventDefaultEvent);
    });
    expect(result.current.error).toBe("Telegram API ID 不能为空");

    act(() => {
      result.current.setApiId("12345");
    });
    await act(async () => {
      await result.current.handleSave(preventDefaultEvent);
    });

    expect(result.current.error).toBe("保存新配置时需要填写 Telegram API Hash");
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
