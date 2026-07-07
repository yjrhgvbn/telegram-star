import { describe, expect, it } from "vitest";
import {
  MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
  MOBILE_BRIDGE_CAPABILITY_QUERY_MESSAGE,
  MOBILE_BRIDGE_COMMAND_MESSAGE,
  MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
  buildMobileBridgeCapabilitiesMessage,
  buildMobileCommandResultMessage,
  parseRemoteMobileShellMessage,
  postRemoteFrameMessage,
} from "./mobileBridge";

describe("mobile bridge helpers", () => {
  it("builds mobile capability and result messages", () => {
    expect(buildMobileBridgeCapabilitiesMessage()).toEqual({
      type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
      capabilities: {
        openExternal: true,
        reload: true,
        switchServer: true,
        deviceRegistration: true,
      },
    });

    expect(
      buildMobileCommandResultMessage({
        requestId: "req-1",
        ok: true,
        message: "已刷新移动端页面。",
      }),
    ).toEqual({
      type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
      requestId: "req-1",
      ok: true,
      message: "已刷新移动端页面。",
    });
  });

  it("parses remote mobile bridge messages from the connected origin", () => {
    expect(
      parseRemoteMobileShellMessage(
        {
          origin: "https://star.example.com",
          data: { type: MOBILE_BRIDGE_CAPABILITY_QUERY_MESSAGE },
        },
        "https://star.example.com",
      ),
    ).toEqual({ type: "mobile-capability-query" });

    expect(
      parseRemoteMobileShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: MOBILE_BRIDGE_COMMAND_MESSAGE,
            requestId: "req-1",
            command: "open-external",
            url: "https://star.example.com/settings",
          },
        },
        "https://star.example.com",
      ),
    ).toEqual({
      type: "mobile-command",
      requestId: "req-1",
      command: "open-external",
      url: "https://star.example.com/settings",
    });
  });

  it("rejects messages from unexpected origins or malformed commands", () => {
    expect(
      parseRemoteMobileShellMessage(
        {
          origin: "https://evil.example.com",
          data: { type: MOBILE_BRIDGE_CAPABILITY_QUERY_MESSAGE },
        },
        "https://star.example.com",
      ),
    ).toBeNull();

    expect(
      parseRemoteMobileShellMessage(
        {
          origin: "https://star.example.com",
          data: {
            type: MOBILE_BRIDGE_COMMAND_MESSAGE,
            requestId: "req-1",
            command: "open-external",
            url: "file:///private.txt",
          },
        },
        "https://star.example.com",
      ),
    ).toBeNull();
  });

  it("posts messages to the remote frame origin", () => {
    const posted: Array<{ message: unknown; origin: string }> = [];
    const target = {
      postMessage(message: unknown, origin: string) {
        posted.push({ message, origin });
      },
    } as Window;

    expect(
      postRemoteFrameMessage(target, "https://star.example.com/api", {
        type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
        capabilities: {
          openExternal: true,
          reload: true,
          switchServer: true,
          deviceRegistration: true,
        },
      }),
    ).toBe(true);

    expect(posted).toEqual([
      {
        message: {
          type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
          capabilities: {
            openExternal: true,
            reload: true,
            switchServer: true,
            deviceRegistration: true,
          },
        },
        origin: "https://star.example.com",
      },
    ]);
  });
});
