import { describe, expect, it } from "vitest";
import {
  DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
  DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE,
  DESKTOP_BRIDGE_COMMAND_MESSAGE,
  DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
  buildDesktopBridgeCapabilitiesMessage,
  buildDesktopCommandResultMessage,
  getRemoteOrigin,
  normalizeExternalUrl,
  parseRemoteShellMessage,
} from "./nativeBridge";

describe("desktop native bridge helpers", () => {
  it("extracts the trusted remote origin", () => {
    expect(getRemoteOrigin("https://star.example.com/api")).toBe("https://star.example.com");
    expect(getRemoteOrigin("not-a-url")).toBeNull();
  });

  it("allows browser, contact and Telegram client protocols", () => {
    expect(normalizeExternalUrl("https://star.example.com/messages")).toBe(
      "https://star.example.com/messages",
    );
    expect(normalizeExternalUrl("tg://resolve?domain=telegram")).toBe(
      "tg://resolve?domain=telegram",
    );
    expect(normalizeExternalUrl("file:///etc/passwd")).toBeNull();
  });

  it("accepts notification bridge messages only from the configured server", () => {
    const message = parseRemoteShellMessage(
      {
        origin: "https://star.example.com",
        data: {
          type: "telegram-star:notification",
          title: "命中消息",
          body: "关键词已命中",
          messageId: 123,
        },
      } as MessageEvent,
      "https://star.example.com",
    );

    expect(message).toEqual({
      type: "notification",
      payload: {
        title: "命中消息",
        body: "关键词已命中",
        messageId: 123,
      },
    });

    expect(
      parseRemoteShellMessage(
        {
          origin: "https://evil.example.com",
          data: { type: "telegram-star:notification", title: "fake" },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toBeNull();
  });

  it("accepts external-open bridge messages with protocol filtering", () => {
    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: "telegram-star:open-external",
            url: "tg://resolve?domain=telegram",
          },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toEqual({
      type: "open-external",
      url: "tg://resolve?domain=telegram",
    });

    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: "telegram-star:open-external",
            url: "file:///etc/passwd",
          },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toBeNull();
  });

  it("accepts desktop capability queries from the configured server", () => {
    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: { type: DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toEqual({ type: "desktop-capability-query" });

    expect(
      parseRemoteShellMessage(
        {
          origin: "https://evil.example.com",
          data: { type: DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toBeNull();
  });

  it("accepts desktop commands with request ids and filters unsafe urls", () => {
    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: DESKTOP_BRIDGE_COMMAND_MESSAGE,
            requestId: "req-1",
            command: "reload",
          },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toEqual({
      type: "desktop-command",
      requestId: "req-1",
      command: "reload",
    });

    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: DESKTOP_BRIDGE_COMMAND_MESSAGE,
            requestId: "req-2",
            command: "open-external",
            url: "https://star.example.com/settings",
          },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toEqual({
      type: "desktop-command",
      requestId: "req-2",
      command: "open-external",
      url: "https://star.example.com/settings",
    });

    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: DESKTOP_BRIDGE_COMMAND_MESSAGE,
            requestId: "req-3",
            command: "open-external",
            url: "file:///etc/passwd",
          },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toBeNull();

    expect(
      parseRemoteShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: DESKTOP_BRIDGE_COMMAND_MESSAGE,
            requestId: "req-4",
            command: "run-shell",
          },
        } as MessageEvent,
        "https://star.example.com",
      ),
    ).toBeNull();
  });

  it("builds desktop bridge response messages", () => {
    expect(buildDesktopBridgeCapabilitiesMessage()).toEqual({
      type: DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
      capabilities: {
        nativeNotification: true,
        openExternal: true,
        reload: true,
        switchServer: true,
        tray: true,
        appUpdater: true,
      },
    });

    expect(
      buildDesktopCommandResultMessage({
        requestId: "req-1",
        ok: true,
        message: "已刷新桌面页面。",
        status: "latest",
      }),
    ).toEqual({
      type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
      requestId: "req-1",
      ok: true,
      message: "已刷新桌面页面。",
      status: "latest",
    });
  });
});
