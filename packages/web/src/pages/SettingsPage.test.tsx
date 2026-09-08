// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import { useClientDevices } from "@/features/settings/hooks/useClientDevices";
import { SettingsPage } from "./SettingsPage";

const api = vi.hoisted(() => ({ list: vi.fn().mockResolvedValue([]), delete: vi.fn(), nativeLeave: vi.fn() }));
vi.mock("@/shared/api/clients", () => ({ clientsApi: api }));
vi.mock("@/hooks/useAuthStatus", () => ({ useAuthStatus: () => ({ authStatus: { authorized: true }, authLoading: false, handleLoginSuccess: vi.fn() }) }));
vi.mock("@/features/settings", () => ({
  useSettingsForm: () => ({ dirty: false, saving: false }),
  SettingsForm: ({ onNavigateRequest }: { onNavigateRequest: (action: () => void) => void }) => <button onClick={() => onNavigateRequest(() => api.nativeLeave())}>原生离开</button>,
}));
vi.mock("@/features/settings/hooks/useServerConnectionSettings", () => ({ useServerConnectionSettings: () => ({ dirty: false }) }));
vi.mock("@/components/AppShell", () => ({ AppShell: MockShell }));

function MockShell({ children, onNavigateRequest, navigationGuard }: {
  children: ReactNode;
  onNavigateRequest: (action: () => void) => void;
  navigationGuard: { busy?: boolean };
}) {
  const navigate = useNavigate();
  return <><button onClick={() => onNavigateRequest(() => navigate("/messages"))}>消息 Tab</button><output aria-label="历史保护忙碌状态">{String(navigationGuard.busy)}</output>{children}</>;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SettingsPage", () => {
  it("blocks main-tab and native departures for a deletion begun by an earlier instance", async () => {
    const user = userEvent.setup();
    const wrapper = createQueryWrapper(createTestQueryClient());
    const previous = renderHook(useClientDevices, { wrapper });
    let finish!: (result: { success: boolean }) => void;
    api.delete.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    let removal!: Promise<void>;
    act(() => { removal = previous.result.current.deleteDevice("other"); });
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    previous.unmount();
    render(<MemoryRouter initialEntries={["/settings"]}><Routes><Route path="/settings" element={<SettingsPage />} /><Route path="/messages" element={<p>消息页</p>} /></Routes></MemoryRouter>, { wrapper });
    expect(screen.getByLabelText("历史保护忙碌状态").textContent).toBe("true");
    await user.click(screen.getByRole("button", { name: "消息 Tab" }));
    await user.click(screen.getByRole("button", { name: "原生离开" }));
    expect(api.nativeLeave).not.toHaveBeenCalled();
    expect(screen.queryByText("消息页")).toBeNull();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await act(async () => { finish({ success: true }); await removal; });
    await waitFor(() => expect(screen.getByLabelText("历史保护忙碌状态").textContent).toBe("false"));
    await user.click(screen.getByRole("button", { name: "消息 Tab" }));
    expect(screen.getByText("消息页")).toBeTruthy();
  });
});
