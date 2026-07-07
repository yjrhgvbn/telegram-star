import { describe, expect, it } from "vitest";
import {
  MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
  MOBILE_BRIDGE_COMMAND_MESSAGE,
  MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
  buildMobileCommandMessage,
  canUseMobileParentBridge,
  parseMobileCapabilitiesMessage,
  parseMobileCommandResultMessage,
} from "./mobileBridge";

describe("web mobile bridge helpers", () => {
  it("builds mobile command messages", () => {
    expect(
      buildMobileCommandMessage("req-1", "open-external", {
        url: "https://star.example.com/settings",
      }),
    ).toEqual({
      type: MOBILE_BRIDGE_COMMAND_MESSAGE,
      requestId: "req-1",
      command: "open-external",
      url: "https://star.example.com/settings",
    });
  });

  it("parses mobile capabilities messages strictly", () => {
    expect(
      parseMobileCapabilitiesMessage({
        type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
        capabilities: {
          openExternal: true,
          reload: true,
          switchServer: true,
          deviceRegistration: true,
        },
      }),
    ).toEqual({
      type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
      capabilities: {
        openExternal: true,
        reload: true,
        switchServer: true,
        deviceRegistration: true,
      },
    });

    expect(
      parseMobileCapabilitiesMessage({
        type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
        capabilities: {
          openExternal: true,
          reload: true,
          switchServer: true,
        },
      }),
    ).toBeNull();
  });

  it("parses mobile command result messages", () => {
    expect(
      parseMobileCommandResultMessage({
        type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
        requestId: "req-1",
        ok: false,
        message: "移动端暂无响应。",
        status: "timeout",
      }),
    ).toEqual({
      type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
      requestId: "req-1",
      ok: false,
      message: "移动端暂无响应。",
      status: "timeout",
    });

    expect(
      parseMobileCommandResultMessage({
        type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
        requestId: "req-1",
        ok: "false",
        message: "invalid",
      }),
    ).toBeNull();
  });

  it("detects whether the page is embedded by a parent window", () => {
    const parentWindow = {} as Window;
    expect(canUseMobileParentBridge({ parent: parentWindow } as Pick<Window, "parent">)).toBe(
      true,
    );

    const selfWindow = {} as { parent: unknown };
    selfWindow.parent = selfWindow;
    expect(canUseMobileParentBridge(selfWindow as Pick<Window, "parent">)).toBe(false);
    expect(canUseMobileParentBridge(undefined)).toBe(false);
  });
});
