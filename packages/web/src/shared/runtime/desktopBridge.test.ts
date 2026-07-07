import { describe, expect, it } from "vitest";
import {
  DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
  DESKTOP_BRIDGE_COMMAND_MESSAGE,
  DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
  buildDesktopCommandMessage,
  canUseDesktopParentBridge,
  parseDesktopCapabilitiesMessage,
  parseDesktopCommandResultMessage,
} from "./desktopBridge";

describe("web desktop bridge helpers", () => {
  it("builds desktop command messages", () => {
    expect(
      buildDesktopCommandMessage("req-1", "open-external", {
        url: "https://star.example.com/settings",
      }),
    ).toEqual({
      type: DESKTOP_BRIDGE_COMMAND_MESSAGE,
      requestId: "req-1",
      command: "open-external",
      url: "https://star.example.com/settings",
    });
  });

  it("parses desktop capabilities messages strictly", () => {
    expect(
      parseDesktopCapabilitiesMessage({
        type: DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
        capabilities: {
          nativeNotification: true,
          openExternal: true,
          reload: true,
          switchServer: true,
          tray: true,
          appUpdater: true,
        },
      }),
    ).toEqual({
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
      parseDesktopCapabilitiesMessage({
        type: DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
        capabilities: {
          nativeNotification: true,
          openExternal: true,
          reload: true,
          switchServer: true,
          tray: true,
        },
      }),
    ).toBeNull();
  });

  it("parses desktop command result messages", () => {
    expect(
      parseDesktopCommandResultMessage({
        type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
        requestId: "req-1",
        ok: false,
        message: "桌面端暂无响应。",
        status: "timeout",
      }),
    ).toEqual({
      type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
      requestId: "req-1",
      ok: false,
      message: "桌面端暂无响应。",
      status: "timeout",
    });

    expect(
      parseDesktopCommandResultMessage({
        type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
        requestId: "req-1",
        ok: "false",
        message: "invalid",
      }),
    ).toBeNull();
  });

  it("detects whether the page is embedded by a parent window", () => {
    const parentWindow = {} as Window;
    expect(canUseDesktopParentBridge({ parent: parentWindow } as Pick<Window, "parent">)).toBe(
      true,
    );

    const selfWindow = {} as { parent: unknown };
    selfWindow.parent = selfWindow;
    expect(canUseDesktopParentBridge(selfWindow as Pick<Window, "parent">)).toBe(false);
    expect(canUseDesktopParentBridge(undefined)).toBe(false);
  });
});
