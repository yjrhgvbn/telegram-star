// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Filter, FilterBackfillJobCreateInput } from "@/types";
import { FiltersFeature } from "./FiltersFeature";
import type { DraftCondition } from "./types";

const useFiltersMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
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

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children, onNavigateRequest }: {
    children: ReactNode;
    onNavigateRequest?: (action: () => void, destination?: string) => void;
  }) => {
    const navigate = useNavigate();
    const request = (destination: string) => onNavigateRequest
      ? onNavigateRequest(() => navigate(destination), destination) : navigate(destination);
    return (
      <>
        <button onClick={() => request("/filters")}>规则 Tab</button>
        <button onClick={() => request("/messages")}>消息 Tab</button>
        <button onClick={() => request("/notifications")}>转发 Tab</button>
        <button onClick={() => request("/settings")}>设置 Tab</button>
        <a href="/messages" onClick={(event) => { event.preventDefault(); request("/messages"); }}>品牌入口</a>
        {children}
      </>
    );
  },
}));

vi.mock("./components/FilterForm", () => ({
  FilterForm: ({ conditions, onUpdateCondition, onAddSenderCondition, onCreateForwardTarget, historyBackfill }: {
    conditions: DraftCondition[];
    onUpdateCondition: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
    onCreateForwardTarget: () => void;
    onAddSenderCondition: () => void;
    historyBackfill: ReactNode;
  }) => (
    <>
      <output aria-label="当前条件">{conditions.flatMap((condition) => condition.values).join("、")}</output>
      <button onClick={() => onUpdateCondition(conditions[0].id, (condition) => ({
        ...condition, type: "keyword", values: ["测试关键词"], input: "",
      }))}>设置测试条件</button>
      <button onClick={onCreateForwardTarget}>新建通道</button>
      <button onClick={onAddSenderCondition}>添加用户条件</button>
      {conditions.filter((condition) => condition.type === "sender").map((condition) => (
        <input key={condition.id} aria-label="测试用户 ID" value={condition.input} onChange={(event) => onUpdateCondition(condition.id, (current) => ({ ...current, input: event.target.value }))} />
      ))}
      {historyBackfill}
    </>
  ),
}));
vi.mock("./components/HistoryBackfillDialog", () => ({
  HistoryBackfillDialog: ({ onStart }: { onStart: (input: FilterBackfillJobCreateInput) => Promise<void> }) => (
    <button onClick={() => void onStart({ mode: "count", perChatLimit: 100 }).catch(() => {})}>测试补录</button>
  ),
}));
vi.mock("./components/PreviewPanel", () => ({
  PreviewPanel: () => <section aria-label="预览样本内容" />,
}));

const selectedFilter: Filter = {
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

const secondFilter: Filter = {
  ...selectedFilter,
  id: 8,
  name: "科技消息",
  conditions: [{ type: "keyword", values: ["设备"] }],
};

let viewportWidth = 1440;
const viewportListeners = new Set<() => void>();

function resizeViewport(width: number) {
  act(() => {
    viewportWidth = width;
    viewportListeners.forEach((listener) => listener());
  });
}

function RouteLocation() {
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="当前路径">{useLocation().pathname}</output>
      <button onClick={() => navigate(-1)}>浏览器返回</button>
      <button onClick={() => navigate(1)}>浏览器前进</button>
    </>
  );
}

function renderWorkspace(path = "/filters", previousEntries: string[] = []) {
  const tree = () => (
    <MemoryRouter initialEntries={[...previousEntries, path]} initialIndex={previousEntries.length}>
      <RouteLocation />
      <Routes>
        <Route path="/filters/:filterId?" element={<FiltersFeature />} />
        <Route path="/messages" element={<p>消息页面</p>} />
        <Route path="/notifications" element={<p>转发页面</p>} />
        <Route path="/settings" element={<p>设置页面</p>} />
      </Routes>
    </MemoryRouter>
  );
  const view = render(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}

async function renameRule(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
  await user.clear(screen.getByRole("textbox", { name: "自定义规则名称" }));
  await user.type(screen.getByRole("textbox", { name: "自定义规则名称" }), name);
  await user.keyboard("{Enter}");
}

function renderEditorFromMessages() {
  return render(
    <MemoryRouter
      initialEntries={["/messages/7", "/filters/7"]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/messages/:filterId" element={<p>消息上下文</p>} />
        <Route path="/filters/:filterId" element={<FiltersFeature />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FiltersFeature", () => {
  beforeEach(() => {
    viewportWidth = 1440;
    viewportListeners.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        const minimum = query.match(/min-width:\s*(\d+)px/);
        const maximum = query.match(/max-width:\s*(\d+)px/);
        return minimum ? viewportWidth >= Number(minimum[1])
          : maximum ? viewportWidth <= Number(maximum[1]) : false;
      },
      media: query,
      addEventListener: (_event: string, listener: () => void) => viewportListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => viewportListeners.delete(listener),
    }));
    useQueryMock.mockReturnValue({
      data: null,
      error: null,
      isFetching: false,
      isLoading: false,
      isPlaceholderData: false,
    });
    useFiltersMock.mockReturnValue({
      filters: [selectedFilter],
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
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("blocks empty or invalid sender constraints for preview and save, then saves valid IDs with AND scope", async () => {
    const user = userEvent.setup();
    const updateFilter = vi.fn().mockResolvedValue(selectedFilter);
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), updateFilter });
    renderWorkspace("/filters/7");
    await user.click(screen.getByRole("button", { name: "添加用户条件" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(screen.getByRole("alert").textContent).toContain("请填写发送者用户 ID");
    expect(useQueryMock.mock.calls.at(-1)?.[0].enabled).toBe(false);
    const field = screen.getByRole("textbox", { name: "测试用户 ID" });
    await user.type(field, "@user");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(screen.getByRole("alert").textContent).toContain("用户 ID 无效");
    expect(useQueryMock.mock.calls.at(-1)?.[0].enabled).toBe(false);
    expect(updateFilter).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "123456789,987654321");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await waitFor(() => expect(updateFilter).toHaveBeenCalledOnce());
    const savedConditions = updateFilter.mock.calls[0][1].conditions;
    const sender = savedConditions.find((condition: { type: string }) => condition.type === "sender");
    const keyword = savedConditions.find((condition: { type: string }) => condition.type === "keyword");
    expect(sender.values).toEqual(["123456789", "987654321"]);
    expect(sender.groupId).not.toBe(keyword.groupId);
  });

  it("returns to the page that opened the filter editor", async () => {
    const user = userEvent.setup();
    renderEditorFromMessages();

    await user.click(screen.getByRole("button", { name: "返回上一页" }));

    expect(screen.getByText("消息上下文")).toBeTruthy();
  });

  it("returns to the opener after confirming an unsaved draft should be discarded", async () => {
    const user = userEvent.setup();
    renderEditorFromMessages();

    await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
    await user.clear(screen.getByRole("textbox", { name: "自定义规则名称" }));
    await user.type(
      screen.getByRole("textbox", { name: "自定义规则名称" }),
      "临时名称",
    );
    await user.click(screen.getByRole("button", { name: "返回上一页" }));
    await user.click(screen.getByRole("button", { name: "放弃修改" }));

    expect(screen.getByText("消息上下文")).toBeTruthy();
  });

  it("restores unsaved changes when switching between rules without saving either rule", async () => {
    const user = userEvent.setup();
    const updateFilter = vi.fn();
    useFiltersMock.mockReturnValue({
      ...useFiltersMock(),
      filters: [selectedFilter, { ...selectedFilter, id: 8, name: "科技消息" }],
      updateFilter,
    });
    renderEditorFromMessages();

    await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
    await user.clear(screen.getByRole("textbox", { name: "自定义规则名称" }));
    await user.type(screen.getByRole("textbox", { name: "自定义规则名称" }), "周末追番");
    await user.keyboard("{Enter}");
    const library = within(screen.getByRole("complementary", { name: "规则列表" }));
    await user.click(library.getByRole("button", { name: /科技消息/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("科技消息");

    // Leaving an unchanged rule must still account for drafts in other rules.
    await user.click(screen.getByRole("button", { name: "返回上一页" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));

    await user.click(library.getByRole("button", { name: /周末追番/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("周末追番");
    expect(within(library.getByRole("button", { name: /周末追番/ })).getByText("未保存")).toBeTruthy();
    expect(updateFilter).not.toHaveBeenCalled();
  });

  it("blocks further editing until the submitted draft has finished saving", async () => {
    const user = userEvent.setup();
    let finishSave!: (filter: Filter) => void;
    const updateFilter = vi.fn(() => new Promise<Filter>((resolve) => { finishSave = resolve; }));
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), updateFilter });
    renderEditorFromMessages();
    await renameRule(user, "等待保存的规则");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
    expect(screen.queryByRole("textbox", { name: "自定义规则名称" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "返回上一页" }));
    expect(screen.queryByText("消息上下文")).toBeNull();
    await act(async () => { finishSave(selectedFilter); });
    await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
    expect(screen.getByRole("textbox", { name: "自定义规则名称" })).toBeTruthy();
  });

  it.each([681, 1000, 1279, 1280])("shows the first rule beside its list at %i px without rewriting the root URL", (width) => {
    viewportWidth = width;
    renderWorkspace();
    expect(screen.getByRole("complementary", { name: "规则列表" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "搜索规则" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("本季新番");
    expect(screen.getByLabelText("当前条件").textContent).toBe("更新");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    expect(screen.queryByRole("button", { name: "收起规则列表" })).toBeNull();
    expect(screen.queryByRole("button", { name: "打开规则列表" })).toBeNull();
    expect(Boolean(screen.queryByRole("tablist", { name: "规则视图" }))).toBe(width < 1280);
    if (width < 1280) {
      expect(screen.getByRole("tabpanel", { name: "编辑条件" })).toBeTruthy();
      expect(screen.queryByRole("tabpanel", { name: "预览样本" })).toBeNull();
    } else {
      expect(screen.getByRole("region", { name: "编辑规则" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "预览样本内容" })).toBeTruthy();
    }
  });

  it.each([390, 680])("keeps the %i px root route as a list until a rule is selected", async (width) => {
    const user = userEvent.setup();
    viewportWidth = width;
    renderWorkspace();
    expect(screen.getByRole("searchbox", { name: "搜索规则" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "编辑规则名称" })).toBeNull();
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");

    await user.click(screen.getByRole("button", { name: /本季新番/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("本季新番");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/7");
    expect(screen.queryByRole("button", { name: "打开规则列表" })).toBeNull();
    expect(screen.getByRole("tabpanel", { name: "编辑条件" })).toBeTruthy();
  });

  it("restores the default rule draft across viewport changes while keeping the root URL", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await renameRule(user, "周末追番");
    await user.click(screen.getByRole("button", { name: "设置测试条件" }));
    const editedConditions = screen.getByLabelText("当前条件").textContent;

    for (const width of [1280, 1279, 1000, 681]) {
      resizeViewport(width);
      expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("周末追番");
      expect(screen.getByLabelText("当前条件").textContent).toBe(editedConditions);
      expect(screen.getByRole("complementary", { name: "规则列表" })).toBeTruthy();
      expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    }
    resizeViewport(680);
    expect(screen.queryByRole("button", { name: "编辑规则名称" })).toBeNull();
    resizeViewport(390);
    expect(screen.queryByRole("button", { name: "编辑规则名称" })).toBeNull();
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    expect(screen.getByRole("button", { name: /周末追番.*未保存/ })).toBeTruthy();

    resizeViewport(1440);
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("周末追番");
    expect(screen.getByLabelText("当前条件").textContent).toBe(editedConditions);
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
  });

  it("keeps explicitly selected details on resize and makes repeated Tab clicks return to the list", async () => {
    const user = userEvent.setup();
    renderWorkspace("/filters/7");
    await renameRule(user, "周末追番");
    resizeViewport(390);
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("周末追番");

    await user.click(screen.getByRole("button", { name: "规则 Tab" }));
    await user.click(screen.getByRole("button", { name: "规则 Tab" }));
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    expect(screen.queryByRole("button", { name: "编辑规则名称" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /周末追番.*未保存/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("周末追番");
  });

  it("keeps the middle-width list available while switching views and selecting another rule", async () => {
    const user = userEvent.setup();
    viewportWidth = 1000;
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter] });
    renderWorkspace("/filters/7");
    const library = within(screen.getByRole("complementary", { name: "规则列表" }));
    await user.click(screen.getByRole("tab", { name: "预览样本" }));
    expect(screen.getByRole("tabpanel", { name: "预览样本" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "编辑条件" })).toBeNull();
    expect(library.getByRole("searchbox", { name: "搜索规则" })).toBeTruthy();
    await user.click(library.getByRole("button", { name: /科技消息/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("科技消息");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/8");
    expect(screen.getByRole("tabpanel", { name: "编辑条件" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "编辑条件" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the draft and chosen view when resizing between tabbed and side-by-side detail", async () => {
    const user = userEvent.setup();
    viewportWidth = 1000;
    renderWorkspace();
    await renameRule(user, "中屏草稿");
    await user.click(screen.getByRole("tab", { name: "预览样本" }));
    expect(screen.queryByRole("tabpanel", { name: "编辑条件" })).toBeNull();

    resizeViewport(1280);
    expect(screen.queryByRole("tablist", { name: "规则视图" })).toBeNull();
    expect(screen.getByRole("region", { name: "编辑规则" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "预览样本内容" })).toBeTruthy();

    resizeViewport(681);
    expect(screen.getByRole("tabpanel", { name: "预览样本" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "编辑条件" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "编辑条件" }));
    expect(screen.getByRole("tabpanel", { name: "编辑条件" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("中屏草稿");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
  });

  it.each([1000, 1440])("saves the derived first rule by its real id and clears its cached draft at %i px", async (width) => {
    const user = userEvent.setup();
    viewportWidth = width;
    const updateFilter = vi.fn(async (_id, payload) => {
      const saved = { ...selectedFilter, ...payload };
      useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [saved, secondFilter] });
      return saved;
    });
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter], updateFilter });
    renderWorkspace();
    await renameRule(user, "周末追番");
    await user.click(screen.getByRole("button", { name: /科技消息/ }));
    await user.click(screen.getByRole("button", { name: "规则 Tab" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));

    expect(updateFilter).toHaveBeenCalledWith(7, expect.objectContaining({ name: "周末追番" }));
    expect(useFiltersMock().createFilter).not.toHaveBeenCalled();
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    resizeViewport(390);
    expect(screen.queryByText("未保存")).toBeNull();
    await user.click(screen.getByRole("button", { name: /周末追番/ }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("周末追番");
  });

  it.each([1000, 1440])("deletes the derived first rule and restores the next rule's draft at %i px without rewriting the root", async (width) => {
    const user = userEvent.setup();
    viewportWidth = width;
    const deleteFilter = vi.fn(async () => {
      useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [secondFilter] });
    });
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter], deleteFilter });
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: /科技消息/ }));
    await renameRule(user, "科技草稿");
    await user.click(screen.getByRole("button", { name: "规则 Tab" }));
    screen.getByRole("button", { name: "更多规则操作" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("menuitem", { name: "删除规则" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除规则" }));

    expect(deleteFilter).toHaveBeenCalledWith(7);
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("科技草稿");
    expect(screen.getByLabelText("当前条件").textContent).toBe("设备");
    expect(screen.getByRole("button", { name: /科技草稿.*未保存/ })).toBeTruthy();
  });

  it("creates a distinct rule from the root toolbar without reusing the default rule", async () => {
    const user = userEvent.setup();
    const createFilter = vi.fn(async (payload) => {
      const created = { ...secondFilter, ...payload };
      useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [created, selectedFilter] });
      return created;
    });
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), createFilter });
    renderWorkspace();
    await user.click(screen.getByRole("button", { name: "新建规则" }));
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/new");
    expect(screen.getByLabelText("当前条件").textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "设置测试条件" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(createFilter).toHaveBeenCalledWith(expect.objectContaining({
      conditions: [expect.objectContaining({ type: "keyword", values: ["测试关键词"] })],
    }));
    expect(useFiltersMock().updateFilter).not.toHaveBeenCalled();
    // The click does not await persistDraft or React Router's navigation commit.
    await waitFor(() => {
      expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/8");
    });
  });

  it("returns an invalid explicit rule to the root and only derives a detail on desktop screens", () => {
    renderWorkspace("/filters/999");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("本季新番");
    resizeViewport(390);
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    expect(screen.queryByRole("button", { name: "编辑规则名称" })).toBeNull();
  });

  it("previews the derived rule and stops preview requests when resizing the root to its list", async () => {
    vi.useFakeTimers();
    renderWorkspace();
    await act(async () => { vi.advanceTimersByTime(801); });
    const preview = useQueryMock.mock.calls.at(-1)?.[0];
    expect(preview.enabled).toBe(true);
    expect(preview.queryKey.slice(0, 2)).toEqual(["filters", "preview"]);
    expect(JSON.parse(preview.queryKey[2])).toEqual([
      expect.objectContaining({ type: "keyword", values: ["更新"] }),
    ]);
    expect(useQueryMock.mock.calls.some(([query]) =>
      query.enabled && JSON.stringify(query.queryKey) === '["filters",7,"backfill","latest"]',
    )).toBe(true);

    resizeViewport(390);
    expect(useQueryMock.mock.calls.at(-1)?.[0].enabled).toBe(false);
  });

  it("keeps condition search, clearing, and new-rule access in the compact list toolbar", async () => {
    const user = userEvent.setup();
    viewportWidth = 390;
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter] });
    renderWorkspace();
    await user.type(screen.getByRole("searchbox", { name: "搜索规则" }), "设备");
    expect(screen.getByRole("button", { name: /科技消息/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /本季新番/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "清空规则搜索" }));
    expect(screen.getByRole("button", { name: /本季新番/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "新建规则" }));
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/new");
  });

  it.each([
    ["消息 Tab", "/messages"],
    ["转发 Tab", "/notifications"],
    ["设置 Tab", "/settings"],
    ["品牌入口", "/messages"],
    ["新建通道", "/notifications"],
  ])("guards unsaved drafts before leaving through %s", async (label, destination) => {
    const user = userEvent.setup();
    renderWorkspace();
    await renameRule(user, "待保留的草稿");
    const trigger = () => screen.getByRole(label === "品牌入口" ? "link" : "button", { name: label });
    await user.click(trigger());
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("待保留的草稿");
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(screen.getByLabelText("当前路径").textContent).toBe(destination));
  });

  it("protects cached drafts while the current rule is pristine and preserves them on the same Tab", async () => {
    const user = userEvent.setup();
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter] });
    renderWorkspace();
    await renameRule(user, "第一条的草稿");
    await user.click(screen.getByRole("button", { name: /科技消息/ }));
    expect((screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "消息 Tab" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    await user.click(screen.getByRole("button", { name: "规则 Tab" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("第一条的草稿");
  });

  it("warns before unloading any draft, including one cached behind a mobile root list", async () => {
    const user = userEvent.setup();
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter] });
    const view = renderWorkspace();
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    await renameRule(user, "刷新前应当确认");
    expect(unload()).toBe(true);
    await user.click(screen.getByRole("button", { name: /科技消息/ }));
    expect(unload()).toBe(true);
    await user.click(screen.getByRole("button", { name: "规则 Tab" }));
    resizeViewport(390);
    expect(unload()).toBe(true);
    view.unmount();
    expect(unload()).toBe(false);
  });

  it("disables saving pristine rules, keeps immediate toggle semantics, and retries failed edits", async () => {
    const user = userEvent.setup();
    const updateFilter = vi.fn()
      .mockRejectedValueOnce(new Error("保存失败，请重试"))
      .mockResolvedValue({ ...selectedFilter, name: "修改后" });
    const toggleFilter = vi.fn().mockResolvedValue(undefined);
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), updateFilter, toggleFilter });
    renderWorkspace();
    const save = () => screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    await user.click(screen.getByRole("switch", { name: /启用监听/ }));
    expect(toggleFilter).toHaveBeenCalledWith(7);
    expect(save().disabled).toBe(true);
    await renameRule(user, "修改后");
    expect(save().disabled).toBe(false);
    await user.click(save());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(save().disabled).toBe(false);
    await user.click(save());
    await waitFor(() => expect(save().disabled).toBe(true));
    expect(screen.getByText("规则已保存")).toBeTruthy();
    expect(updateFilter).toHaveBeenCalledTimes(2);
  });

  it("keeps validation retryable for new rules", async () => {
    const user = userEvent.setup();
    renderWorkspace("/filters/new");
    const save = screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await user.click(save);
    expect(screen.getByRole("alert").textContent).toBe("至少添加一个有效条件");
    expect(save.disabled).toBe(false);
    expect(useFiltersMock().createFilter).not.toHaveBeenCalled();
  });

  it("shows save and toggle feedback outside the hidden editor while previewing", async () => {
    const user = userEvent.setup();
    viewportWidth = 1000;
    const updateFilter = vi.fn().mockRejectedValueOnce(new Error("网络保存失败"))
      .mockResolvedValue({ ...selectedFilter, name: "预览中的修改" });
    const toggleFilter = vi.fn().mockRejectedValueOnce(new Error("启停失败"));
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), updateFilter, toggleFilter });
    renderWorkspace();
    await renameRule(user, "预览中的修改");
    await user.click(screen.getByRole("tab", { name: "预览样本" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect((await screen.findByRole("alert")).textContent).toBe("网络保存失败");
    expect(screen.getByRole("tabpanel", { name: "预览样本" })).toBeTruthy();
    expect(screen.getByRole("alert").closest("[hidden]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(await screen.findByText("规则已保存")).toBeTruthy();
    await user.click(screen.getByRole("switch", { name: /启用监听/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("启停失败");
    expect(screen.getByRole("alert").closest("[hidden]")).toBeNull();
  });

  it("keeps a failed detail load at its URL and retries without inventing an empty or new rule", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [], error: "服务器不可用", refresh });
    const view = renderWorkspace("/filters/7");
    expect(screen.getByRole("alert").textContent).toContain("服务器不可用");
    expect(screen.queryByText("还没有规则，点击右上角新建。")).toBeNull();
    expect(screen.queryByRole("button", { name: "编辑规则名称" })).toBeNull();
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/7");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter], error: null });
    view.refresh();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("本季新番");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/7");
  });

  it("keeps the default selection and its draft when a refetch reorders the library or fails", async () => {
    const user = userEvent.setup();
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [selectedFilter, secondFilter] });
    const view = renderWorkspace();
    await renameRule(user, "正在编辑的第一条");
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), filters: [secondFilter, selectedFilter] });
    view.refresh();
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("正在编辑的第一条");
    expect(screen.getByRole("button", { name: /正在编辑的第一条.*未保存/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters");
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), error: "刷新失败" });
    view.refresh();
    expect(screen.getByRole("alert").textContent).toContain("刷新失败");
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("正在编辑的第一条");
  });

  it.each(["save", "backfill"])("does not navigate back after leaving a pending new-rule %s", async (mode) => {
    const user = userEvent.setup();
    let finish!: (filter: Filter) => void;
    const createFilter = vi.fn(() => new Promise<Filter>((resolve) => { finish = resolve; }));
    const startBackfillJob = vi.fn().mockResolvedValue({ id: "job-1" });
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), createFilter, startBackfillJob });
    renderWorkspace("/filters/new", ["/messages"]);
    await user.click(screen.getByRole("button", { name: "设置测试条件" }));
    await user.click(screen.getByRole("button", { name: mode === "save" ? "保存" : "测试补录", exact: true }));
    await user.click(screen.getByRole("button", { name: "消息 Tab" }));
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/new");
    // Deliberately bypass the shell guard to exercise the late-response defense.
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    expect(screen.getByLabelText("当前路径").textContent).toBe("/messages");
    await act(async () => { finish(secondFilter); });
    expect(screen.getByLabelText("当前路径").textContent).toBe("/messages");
  });

  it("does not navigate after a pending delete returns to an unmounted editor", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const deleteFilter = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), deleteFilter });
    renderWorkspace("/filters/7", ["/messages"]);
    screen.getByRole("button", { name: "更多规则操作" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("menuitem", { name: "删除规则" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除规则" }));
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    await act(async () => { finish(); });
    expect(screen.getByLabelText("当前路径").textContent).toBe("/messages");
  });

  it("does not replace a later editor after history leaves and returns to the same new-rule URL", async () => {
    const user = userEvent.setup();
    let finish!: (filter: Filter) => void;
    const createFilter = vi.fn(() => new Promise<Filter>((resolve) => { finish = resolve; }));
    useFiltersMock.mockReturnValue({ ...useFiltersMock(), createFilter });
    renderWorkspace("/filters/new", ["/filters/new", "/filters/7"]);
    await user.click(screen.getByRole("button", { name: "设置测试条件" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    await act(async () => { finish(secondFilter); });
    expect(screen.getByLabelText("当前路径").textContent).toBe("/filters/new");
    expect(screen.getByRole("button", { name: "编辑规则名称" }).textContent).toBe("新建规则");
    expect(screen.queryByText("规则已保存")).toBeNull();
  });
});
