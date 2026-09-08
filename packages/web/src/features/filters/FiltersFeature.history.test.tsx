// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceHistoryGuardProvider } from "@/components/WorkspaceHistoryGuard";
import type { Filter } from "@/types";
import { FiltersFeature } from "./FiltersFeature";

const useFiltersMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null, error: null, isFetching: false, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/useAuthStatus", () => ({
  useAuthStatus: () => ({
    authStatus: { authorized: true },
    authLoading: false,
    handleLoginSuccess: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFilters", () => ({ useFilters: useFiltersMock }));
vi.mock("./components/FilterForm", () => ({ FilterForm: () => <p>规则编辑内容</p> }));
vi.mock("./components/PreviewPanel", () => ({ PreviewPanel: () => <p>预览样本内容</p> }));

const firstFilter: Filter = {
  id: 7,
  name: "本季新番",
  conditions: [{ type: "keyword", values: ["更新"] }],
  enabled: true,
  autoLocateUnreadNearRead: true,
  forwardTargetIds: [],
  latestMessageAt: null,
  isFocused: false,
  lastEngagedAt: null,
  lastEngagementType: null,
  lastEngagedMessageId: null,
  manualGroupId: null,
  manualSortOrder: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

let viewportWidth = 390;
const viewportListeners = new Set<() => void>();

function resizeViewport(width: number) {
  act(() => {
    viewportWidth = width;
    viewportListeners.forEach((listener) => listener());
  });
}

function renderWorkspace(entries: string[]) {
  const router = createMemoryRouter([{
    element: <WorkspaceHistoryGuardProvider><Outlet /></WorkspaceHistoryGuardProvider>,
    children: [
      { path: "/filters/:filterId?", element: <FiltersFeature /> },
      { path: "/messages/:filterId?", element: <p>消息页面</p> },
    ],
  }], { initialEntries: entries });
  render(<RouterProvider router={router} />);
  return router;
}

async function renameRule(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
  await user.clear(screen.getByRole("textbox", { name: "自定义规则名称" }));
  await user.type(screen.getByRole("textbox", { name: "自定义规则名称" }), name);
  await user.keyboard("{Enter}");
}

beforeEach(() => {
  viewportWidth = 390;
  viewportListeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      const minimum = query.match(/min-width:\s*(\d+)px/);
      const maximum = query.match(/max-width:\s*(\d+)px/);
      return minimum ? viewportWidth >= Number(minimum[1])
        : maximum ? viewportWidth <= Number(maximum[1]) : false;
    },
    addEventListener: (_event: string, listener: () => void) => viewportListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => viewportListeners.delete(listener),
  }));
  useFiltersMock.mockReturnValue({
    filters: [firstFilter, { ...firstFilter, id: 8, name: "科技消息" }],
    chats: [],
    loading: false,
    chatsLoading: false,
    error: null,
    refresh: vi.fn(),
    createFilter: vi.fn(),
    updateFilter: vi.fn(),
    deleteFilter: vi.fn(),
    toggleFilter: vi.fn(),
    startBackfillJob: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FiltersFeature history protection", () => {
  it("returns to the real opener after one page confirmation without a second history prompt", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages/7", "/filters/7"]);
    await renameRule(user, "待放弃的草稿");
    await user.click(screen.getByRole("button", { name: "返回上一页" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("尚未保存的规则修改将不会保留。");
    await user.click(within(dialog).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages/7"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(useFiltersMock().updateFilter).not.toHaveBeenCalled();
  });

  it("preserves cached drafts through same-workspace POP and protects them before leaving from the root list", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages", "/filters", "/filters/7"]);
    await renameRule(user, "缓存中的草稿");
    await act(async () => { void router.navigate(-1); });
    expect(router.state.location.pathname).toBe("/filters");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => { void router.navigate(-1); });
    expect(router.state.location.pathname).toBe("/filters");
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "继续编辑" }));
    const library = within(screen.getByRole("complementary", { name: "规则列表" }));
    await user.click(library.getByRole("button", { name: /缓存中的草稿/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("缓存中的草稿");
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(useFiltersMock().updateFilter).not.toHaveBeenCalled();
  });

  it("restores discarded values when returning to the root reuses the same default rule after a resize", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages", "/filters", "/filters/7"]);
    await renameRule(user, "应该恢复的名称");
    await user.click(screen.getByRole("button", { name: "返回上一页" }));
    resizeViewport(1000);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/filters"));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("本季新番");
    expect((screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("closes a stale page confirmation when history moves within the workspace and retains the draft", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages", "/filters", "/filters/7"]);
    await renameRule(user, "历史切换中的草稿");
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await act(async () => { void router.navigate(-1); });
    expect(router.state.location.pathname).toBe("/filters");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: /历史切换中的草稿/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("历史切换中的草稿");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("replaces a page confirmation with a single history confirmation when browser back leaves the workspace", async () => {
    const user = userEvent.setup();
    const router = renderWorkspace(["/messages/7", "/filters/7"]);
    await renameRule(user, "历史返回前保留");
    await user.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", { name: "消息" }));
    await act(async () => { void router.navigate(-1); });
    await waitFor(() => expect(screen.getAllByRole("alertdialog")).toHaveLength(1));
    const confirmation = screen.getByRole("alertdialog");
    expect(confirmation.textContent).toContain("离开后，尚未保存的修改将不会保留。");
    await user.click(within(confirmation).getByRole("button", { name: "继续编辑" }));
    expect(router.state.location.pathname).toBe("/filters/7");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("历史返回前保留");
  });
});
