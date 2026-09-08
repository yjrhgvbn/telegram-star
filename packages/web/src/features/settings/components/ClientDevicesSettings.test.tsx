// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientDevice } from "@/types";
import type { useDesktopBridge } from "@/shared/runtime/desktopBridge";
import type { useMobileBridge } from "@/shared/runtime/mobileBridge";
import { ClientDevicesSettings } from "./ClientDevicesSettings";
import { ClientRuntimeSettings } from "./ClientRuntimeSettings";

const bridgeMocks = vi.hoisted(() => ({ desktop: vi.fn(), mobile: vi.fn() }));
vi.mock("@/shared/runtime/desktopBridge", () => ({ useDesktopBridge: bridgeMocks.desktop }));
vi.mock("@/shared/runtime/mobileBridge", () => ({ useMobileBridge: bridgeMocks.mobile }));

function createDevice(id: string, patch: Partial<ClientDevice> = {}): ClientDevice {
  return {
    id,
    name: `设备 ${id}`,
    type: "web",
    platform: "browser",
    os: "windows",
    appVersion: "1.2.3",
    capabilities: {
      nativeNotification: false,
      secureStorage: false,
      openExternal: true,
      scanQrCode: false,
      backgroundRefresh: false,
      tray: false,
      appUpdater: false,
    },
    lastSeenAt: "2026-09-08T01:00:00Z",
    createdAt: "2026-09-01T01:00:00Z",
    ...patch,
  };
}

function desktopState(patch: Partial<ReturnType<typeof useDesktopBridge>> = {}): ReturnType<typeof useDesktopBridge> {
  return {
    available: false,
    capabilities: null,
    pendingCommand: null,
    lastResult: null,
    sendCommand: vi.fn(),
    ...patch,
  };
}

function mobileState(patch: Partial<ReturnType<typeof useMobileBridge>> = {}): ReturnType<typeof useMobileBridge> {
  return {
    available: false,
    capabilities: null,
    pendingCommand: null,
    lastResult: null,
    sendCommand: vi.fn(),
    ...patch,
  };
}

function devicesState() {
  return {
    devices: [
      createDevice("current", { name: "当前浏览器" }),
      createDevice("desktop", { name: "工作电脑", type: "desktop", platform: "tauri" }),
      createDevice("mobile", { name: "随身手机", type: "mobile", platform: "tauri", os: "android" }),
      createDevice("pwa", { name: "平板应用", type: "pwa", os: "ios" }),
    ],
    currentClientId: "current",
    deletingId: null,
    loading: false,
    refreshing: false,
    error: null,
    deleteDevice: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
  };
}

beforeEach(() => {
  bridgeMocks.desktop.mockReturnValue(desktopState());
  bridgeMocks.mobile.mockReturnValue(mobileState());
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ClientDevicesSettings", () => {
  it("keeps the real current device summary on Web without native actions or a second refresh", () => {
    render(<ClientDevicesSettings state={devicesState()} />);
    const current = screen.getByRole("region", { name: "当前设备" });
    expect(within(current).getByRole("heading", { name: "当前浏览器" })).not.toBeNull();
    expect(within(current).getByText("Windows · 浏览器 · v1.2.3")).not.toBeNull();
    expect(within(current).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /刷新/ })).toBeNull();
  });

  it("requires confirmation to remove another record and prevents removing the current device", async () => {
    const user = userEvent.setup();
    const state = devicesState();
    render(<ClientDevicesSettings state={state} />);
    const currentRemove = screen.getByRole("button", { name: "移除 当前浏览器 的记录" }) as HTMLButtonElement;
    expect(currentRemove.disabled).toBe(true);
    await user.click(currentRemove);
    expect(state.deleteDevice).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "移除 工作电脑 的记录" }));
    expect(state.deleteDevice).not.toHaveBeenCalled();
    expect(screen.getByText(/不会中断设备访问/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "移除记录", exact: true }));
    await waitFor(() => expect(state.deleteDevice).toHaveBeenCalledWith("desktop"));
    expect(await screen.findByText("已移除“工作电脑”的记录")).not.toBeNull();
  });

  it("keeps a failed removal open for retry and catches the rejected request", async () => {
    const user = userEvent.setup();
    const state = devicesState();
    state.deleteDevice.mockRejectedValueOnce(new Error("服务器暂时不可用"));
    render(<ClientDevicesSettings state={state} />);
    await user.click(screen.getByRole("button", { name: "移除 工作电脑 的记录" }));
    await user.click(screen.getByRole("button", { name: "移除记录", exact: true }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("服务器暂时不可用");
    await user.click(screen.getByRole("button", { name: "移除记录", exact: true }));
    await waitFor(() => expect(state.deleteDevice).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("已移除“工作电脑”的记录")).not.toBeNull();
  });

  it("filters by actual runtime type and searches platform text with an empty-state reset", async () => {
    const user = userEvent.setup();
    render(<ClientDevicesSettings state={devicesState()} />);
    const list = screen.getByRole("list", { name: "设备记录列表" });
    await user.click(screen.getByRole("button", { name: "桌面", exact: true }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("工作电脑")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "手机", exact: true }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("随身手机")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "浏览器", exact: true }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const search = screen.getByRole("searchbox", { name: "搜索设备记录" });
    await user.type(search, "iOS");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("平板应用")).not.toBeNull();
    await user.clear(search);
    await user.type(search, "不存在");
    expect(screen.getByText("没有找到匹配的设备")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "查看全部记录" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });
});

describe("ClientRuntimeSettings", () => {
  it("shows only declared native actions and forwards the current URL through the existing bridge", async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn().mockResolvedValue({ ok: true });
    bridgeMocks.desktop.mockReturnValue(desktopState({
      available: true,
      capabilities: { reload: true, openExternal: true, nativeNotification: false, appUpdater: false, switchServer: false, tray: true },
      sendCommand,
    }));
    render(<ClientRuntimeSettings device={createDevice("current")} />);
    expect(screen.getByText("Windows · 桌面客户端 · v1.2.3")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "测试系统通知" })).toBeNull();
    expect(screen.queryByRole("button", { name: "检查更新" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "浏览器打开" }));
    expect(sendCommand).toHaveBeenCalledWith("open-external", { url: window.location.href });
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(sendCommand).toHaveBeenCalledWith("reload", { url: undefined });
  });

  it("keeps mobile actions locked while the real bridge is pending and displays its failure", () => {
    bridgeMocks.mobile.mockReturnValue(mobileState({
      available: true,
      capabilities: { reload: true, openExternal: true, switchServer: true, deviceRegistration: true },
      pendingCommand: "reload",
      lastResult: { type: "telegram-star:mobile-command-result", requestId: "one", ok: false, message: "移动端暂无响应。" },
    }));
    render(<ClientRuntimeSettings device={createDevice("current", { os: "android" })} />);
    expect(screen.getByText("Android · 手机客户端 · v1.2.3")).not.toBeNull();
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("移动端暂无响应。");
  });

  it("asks the page to protect drafts before reloading or replacing the native client's site", async () => {
    const user = userEvent.setup();
    const sendCommand = vi.fn().mockResolvedValue({ ok: true });
    const onNavigateRequest = vi.fn<(action: () => void) => void>();
    bridgeMocks.desktop.mockReturnValue(desktopState({
      available: true,
      capabilities: { reload: true, openExternal: false, nativeNotification: false, appUpdater: false, switchServer: true, tray: true },
      sendCommand,
    }));
    render(<ClientDevicesSettings state={devicesState()} onNavigateRequest={onNavigateRequest} />);
    await user.click(screen.getByRole("button", { name: "更换客户端站点" }));
    expect(onNavigateRequest).toHaveBeenCalledTimes(1);
    expect(sendCommand).not.toHaveBeenCalled();
    onNavigateRequest.mock.calls[0]![0]();
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith("switch-server", { url: undefined }));

    sendCommand.mockClear();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(onNavigateRequest).toHaveBeenCalledTimes(2);
    expect(sendCommand).not.toHaveBeenCalled();
    onNavigateRequest.mock.calls[1]![0]();
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith("reload", { url: undefined }));
  });
});
