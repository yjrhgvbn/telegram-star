// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ClientShellBridgeContext,
  useClientExternalLink,
  type ClientShellBridgeValue,
} from "./ClientShellBridgeProvider";

function createWrapper(value: ClientShellBridgeValue) {
  return function ClientShellBridgeTestWrapper({ children }: { children: ReactNode }) {
    return (
      <ClientShellBridgeContext.Provider value={value}>
        {children}
      </ClientShellBridgeContext.Provider>
    );
  };
}

function createClickEvent() {
  return {
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<HTMLAnchorElement>;
}

describe("ClientShellBridgeProvider", () => {
  it("prevents browser navigation when the native shell handles external links", () => {
    const openExternal = vi.fn(() => true);
    const beforeOpen = vi.fn();
    const { result } = renderHook(() => useClientExternalLink(), {
      wrapper: createWrapper({ openExternal }),
    });
    const event = createClickEvent();

    expect(result.current(event, "https://t.me/c/1/2", beforeOpen)).toBe(true);
    expect(beforeOpen).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith("https://t.me/c/1/2");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("keeps normal anchor navigation when no native shell handles the link", () => {
    const openExternal = vi.fn(() => false);
    const { result } = renderHook(() => useClientExternalLink(), {
      wrapper: createWrapper({ openExternal }),
    });
    const event = createClickEvent();

    expect(result.current(event, "https://t.me/c/1/2")).toBe(false);
    expect(openExternal).toHaveBeenCalledWith("https://t.me/c/1/2");
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
