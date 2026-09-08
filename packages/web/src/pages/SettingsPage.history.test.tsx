// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigStatus } from "@telegram-star/shared/contracts/config";
import { WorkspaceHistoryGuardProvider } from "@/components/WorkspaceHistoryGuard";
import { createQueryWrapper } from "@/test/queryTestUtils";
import { SettingsPage } from "./SettingsPage";

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/api/client", () => ({ api: { config: api } }));
vi.mock("@/shared/api/clients", () => ({ clientsApi: { list: vi.fn().mockResolvedValue([]), delete: vi.fn() } }));
vi.mock("@/hooks/useAuthStatus", () => ({
  useAuthStatus: () => ({ authStatus: { authorized: true }, authLoading: false, handleLoginSuccess: vi.fn() }),
}));

const config: AppConfigStatus = {
  telegram: { telegramConfigured: true, telegramConfigSource: "database", databaseConfigured: true, apiId: 12345, apiHashMasked: "ab***cd" },
  media: { thumbIndex: 1, thumbQuality: "medium" },
};

beforeEach(() => { api.get.mockReset().mockResolvedValue(config); api.update.mockReset(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

function renderWorkspace(entries: string[]) {
  const router = createMemoryRouter([{
    element: <WorkspaceHistoryGuardProvider><Outlet /></WorkspaceHistoryGuardProvider>,
    children: [
      { path: "/settings/:sectionId?", element: <SettingsPage /> },
      { path: "/messages", element: <p>消息页面</p> },
    ],
  }], { initialEntries: entries });
  render(<RouterProvider router={router} />, { wrapper: createQueryWrapper() });
  return router;
}

async function editAndRequestLeave(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByLabelText("API ID");
  await user.clear(input);
  await user.type(input, "67890");
  await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
}

describe("SettingsPage history protection", () => {
  it("closes a stale leave prompt on internal category POP without discarding any drafts", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/settings/media", "/settings/telegram"]);
    await editAndRequestLeave(user);
    await act(async () => { void router.navigate(-1); });
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/media"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(screen.getByRole("navigation", { name: "设置分类" })).getByRole("button", { name: "Telegram" }));
    expect((screen.getByLabelText("API ID") as HTMLInputElement).value).toBe("67890");
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(router.state.location.pathname).toBe("/settings/telegram");
    expect(api.update).not.toHaveBeenCalled();
  });

  it("replaces an existing page prompt for an external POP and preserves edits on cancellation", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages", "/settings/telegram"]);
    await editAndRequestLeave(user);
    await act(async () => { void router.navigate(-1); });
    expect(await screen.findByText("离开后，尚未保存的修改将不会保留。")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("离开设置后，尚未保存的修改将不会保留。")).toBeNull());
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect((screen.getByLabelText("API ID") as HTMLInputElement).value).toBe("67890");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => { void router.navigate(-1); });
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
