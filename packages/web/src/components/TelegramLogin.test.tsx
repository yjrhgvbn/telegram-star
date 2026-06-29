// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { AuthStatus } from "@/types";
import type { AppConfigStatus } from "@telegram-star/shared/contracts/config";
import { TelegramLogin } from "./TelegramLogin";

function createAuthStatus(patch: Partial<AuthStatus> = {}): AuthStatus {
  return {
    connected: false,
    authorized: false,
    waitingForCode: false,
    waitingForPassword: false,
    telegramConfigured: true,
    telegramConfigSource: "database",
    databaseConfigured: true,
    apiId: 12345,
    apiHashMasked: "ab***cd",
    ...patch,
  };
}

function createConfig(patch: Partial<AppConfigStatus> = {}): AppConfigStatus {
  return {
    telegram: {
      telegramConfigured: true,
      telegramConfigSource: "database",
      databaseConfigured: true,
      apiId: 67890,
      apiHashMasked: "ne***sh",
    },
    media: {
      thumbIndex: 1,
      thumbQuality: "medium",
    },
    ...patch,
  };
}

describe("TelegramLogin", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("saves missing Telegram config and advances to phone login", async () => {
    const user = userEvent.setup();
    const nextConfig = createConfig();
    const updateSpy = vi.spyOn(api.config, "update").mockResolvedValue(nextConfig);
    const queryClient = createTestQueryClient();

    render(
      <TelegramLogin
        authStatus={createAuthStatus({
          telegramConfigured: false,
          telegramConfigSource: "missing",
          databaseConfigured: false,
          apiId: null,
          apiHashMasked: null,
        })}
        onLoginSuccess={vi.fn()}
      />,
      { wrapper: createQueryWrapper(queryClient) },
    );

    await user.type(screen.getByPlaceholderText("123456"), "67890");
    await user.type(screen.getByPlaceholderText("请输入 API Hash"), "new-hash");
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith({
        telegram: {
          apiId: "67890",
          apiHash: "new-hash",
        },
      }),
    );
    expect(queryClient.getQueryData(queryKeys.config.status)).toEqual(nextConfig);
    expect(await screen.findByPlaceholderText("+86 13800138000")).not.toBeNull();
  });

  it("completes phone, code, and 2FA password login flow", async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    const sendCodeSpy = vi.spyOn(api.auth, "sendCode").mockResolvedValue({ status: "sent" });
    const loginSpy = vi.spyOn(api.auth, "login")
      .mockResolvedValueOnce({ status: "password_required" })
      .mockResolvedValueOnce({ status: "success" });

    render(
      <TelegramLogin authStatus={createAuthStatus()} onLoginSuccess={onLoginSuccess} />,
      { wrapper: createQueryWrapper() },
    );

    await user.type(screen.getByPlaceholderText("+86 13800138000"), "+8613800138000");
    await user.click(screen.getByRole("button", { name: "发送验证码" }));

    await waitFor(() => expect(sendCodeSpy).toHaveBeenCalledWith("+8613800138000"));
    await user.type(await screen.findByPlaceholderText("12345"), "54321");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await user.type(await screen.findByPlaceholderText("请输入你的两步验证密码"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
    expect(loginSpy).toHaveBeenNthCalledWith(1, "+8613800138000", "54321", undefined);
    expect(loginSpy).toHaveBeenNthCalledWith(2, "+8613800138000", "54321", "secret-pass");
  });
});
