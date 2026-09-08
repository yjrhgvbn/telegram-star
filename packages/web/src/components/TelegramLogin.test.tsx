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

  it("keeps keyboard focus inside authorization and ignores accidental dismissal", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">背景操作</button>
        <TelegramLogin authStatus={createAuthStatus()} onLoginSuccess={vi.fn()} />
      </>,
      { wrapper: createQueryWrapper() },
    );

    const dialog = screen.getByRole("dialog", { name: "连接 Telegram" });
    const phoneInput = screen.getByLabelText("手机号码");
    await waitFor(() => expect(document.activeElement).toBe(phoneInput));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "发送验证码" }));
    await user.tab();
    await waitFor(() => expect(document.activeElement).toBe(phoneInput));
    await user.tab({ shift: true });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");
    await user.click(document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!);
    expect(screen.getByRole("dialog", { name: "连接 Telegram" })).toBe(dialog);
    expect(screen.queryByRole("button", { name: "关闭" })).toBeNull();
  });

  it("preserves the code on login failure and locks stage navigation while submitting", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.auth, "sendCode").mockResolvedValue({ status: "sent" });
    let finishLogin!: () => void;
    vi.spyOn(api.auth, "login").mockImplementation(() => new Promise((resolve) => {
      finishLogin = () => resolve({ status: "error", error: "验证码无效，请重新输入" });
    }));
    render(
      <TelegramLogin authStatus={createAuthStatus()} onLoginSuccess={vi.fn()} />,
      { wrapper: createQueryWrapper() },
    );

    await user.type(screen.getByLabelText("手机号码"), "+8613800138000{Enter}");
    const codeInput = await screen.findByLabelText("验证码") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(codeInput));
    await user.type(codeInput, "54321{Enter}");
    const back = screen.getByRole("button", { name: "返回修改手机号" }) as HTMLButtonElement;
    expect(codeInput.disabled).toBe(true);
    expect(back.disabled).toBe(true);
    await user.click(back);
    expect(screen.queryByLabelText("手机号码")).toBeNull();

    finishLogin();
    const error = await screen.findByRole("alert");
    expect(error.textContent).toBe("验证码无效，请重新输入");
    expect(codeInput.value).toBe("54321");
    expect(codeInput.disabled).toBe(false);
    expect(codeInput.getAttribute("aria-invalid")).toBe("true");
    expect(codeInput.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);

    await user.click(back);
    const phoneInput = screen.getByLabelText("手机号码") as HTMLInputElement;
    expect(phoneInput.value).toBe("+8613800138000");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(phoneInput);
  });
});
