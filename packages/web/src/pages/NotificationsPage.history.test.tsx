// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceHistoryGuardProvider } from "@/components/WorkspaceHistoryGuard";
import { createDraftTarget } from "@/features/notifications/types";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import { NotificationsPage } from "./NotificationsPage";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn() }));
vi.mock("@/api/client", () => ({ api: { forwardTargets: api } }));
vi.mock("@/hooks/useAuthStatus", () => ({
  useAuthStatus: () => ({ authStatus: { authorized: true }, authLoading: false, handleLoginSuccess: vi.fn() }),
}));
vi.mock("@/hooks/useFilters", () => ({
  useFilters: () => ({ filters: [], chats: [], loading: false, error: null, refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderWorkspace(entries: string[]) {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.forwardTargets.all, [1, 2].map(id => ({
    ...createDraftTarget(), id, name: `通道 ${id}`, appriseUrl: `test://${id}`,
    createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
  })));
  const router = createMemoryRouter([{
    element: <WorkspaceHistoryGuardProvider><Outlet /></WorkspaceHistoryGuardProvider>,
    children: [
      { path: "/notifications/:targetId?", element: <NotificationsPage /> },
      { path: "/messages", element: <p>消息页面</p> },
    ],
  }], { initialEntries: entries });
  render(<RouterProvider router={router} />, { wrapper: createQueryWrapper(client) });
  return router;
}

describe("NotificationsPage history protection", () => {
  it.each([
    ["/notifications", "/notifications/1"],
    ["/notifications/1", "/notifications"],
  ])("discards the same target's draft during POP from %s to %s without a second prompt", async (destination, origin) => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages", destination, origin]);
    await user.type(screen.getByLabelText("Apprise 地址"), "/edited");
    await act(async () => { void router.navigate(-1); });
    expect(router.state.location.pathname).toBe(origin);
    const confirmation = await screen.findByRole("alertdialog");
    await user.click(within(confirmation).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(destination));
    expect((screen.getByLabelText("Apprise 地址") as HTMLInputElement).value).toBe("test://1");
    expect(screen.queryByText("未保存")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("cancels a history switch without losing edits, then discards them when switching channels", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/notifications/2", "/notifications/1"]);
    await user.type(screen.getByLabelText("Apprise 地址"), "/edited");
    await act(async () => { void router.navigate(-1); });
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "继续编辑" }));
    expect(router.state.location.pathname).toBe("/notifications/1");
    expect((screen.getByLabelText("Apprise 地址") as HTMLInputElement).value).toBe("test://1/edited");
    await act(async () => { void router.navigate(-1); });
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/notifications/2"));
    expect((screen.getByLabelText("Apprise 地址") as HTMLInputElement).value).toBe("test://2");
    expect(screen.queryByText("未保存")).toBeNull();
  });

  it("replaces a page leave prompt with the history prompt and clears its abandoned destination", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/notifications", "/notifications/1"]);
    await user.type(screen.getByLabelText("Apprise 地址"), "/edited");
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    expect(screen.getByText("离开后，当前通道未保存的修改将不会保留。")).toBeTruthy();
    await act(async () => { void router.navigate(-1); });
    expect(await screen.findByText("离开后，尚未保存的修改将不会保留。")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("离开后，当前通道未保存的修改将不会保留。")).toBeNull());
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/notifications"));
    expect((screen.getByLabelText("Apprise 地址") as HTMLInputElement).value).toBe("test://1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/notifications/2"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
