// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter, FilterGroup, FilterGroupOrderInput } from "@/types";
import { moveFilterInManualOrder } from "@/hooks/useFilters";
import { FilterPanel } from "./FilterPanel";
import { reorderIds } from "../utils/filterPanelOrder";

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `消息组 ${id}`,
    systemKey: null,
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
    ...patch,
  };
}

function allMessages(patch: Partial<Filter> = {}): Filter {
  return createFilter(99, { name: "全部消息", systemKey: "all_messages", conditions: [], enabled: false, ...patch });
}

function createGroup(id: number, patch: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id,
    name: `目录 ${id}`,
    sortOrder: id - 1,
    filterCount: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function panelProps(patch: Partial<React.ComponentProps<typeof FilterPanel>> = {}) {
  const filters = patch.filters ?? [];
  const groups = patch.filterGroups ?? [];
  return {
    filterGroups: groups,
    ungroupedPosition: groups.length,
    loading: false,
    selectedFilterId: "",
    onSelectFilter: vi.fn(),
    onCreateGroup: vi.fn().mockResolvedValue(undefined),
    onRenameGroup: vi.fn().mockResolvedValue(undefined),
    onDeleteGroup: vi.fn().mockResolvedValue(undefined),
    onReorderGroups: vi.fn().mockResolvedValue(undefined),
    onSetPlacement: vi.fn().mockResolvedValue(undefined),
    ...patch,
    filters: filters.some((filter) => filter.systemKey === "all_messages") ? filters : [allMessages(), ...filters],
  };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string, kind = "消息组") {
  await user.click(screen.getByRole("button", { name: `${kind} ${name}的操作` }));
  return screen.findByRole("dialog");
}

function selection(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}(最新消息|暂无消息|，监听已停用)`) });
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("FilterPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows directories and independent entries without artificial hierarchy or focus controls", () => {
    const props = panelProps({
      filterGroups: [createGroup(1, { name: "本季在追", filterCount: 11 })],
      filters: [createFilter(1, { name: "有归属的番剧", manualGroupId: 1 }), createFilter(2, { name: "独立消息", isFocused: true })],
    });
    render(<FilterPanel {...props} />);

    const directory = screen.getByRole("heading", { name: "本季在追" }).closest("section")!;
    expect(within(directory).getByText("有归属的番剧")).toBeTruthy();
    expect(within(directory).queryByText("独立消息")).toBeNull();
    expect(selection("独立消息").querySelector("svg")).toBeNull();
    expect(screen.queryByText("未分组")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: /重点关注|配置分组|收藏/ })).toBeNull();
    expect(screen.queryByText("11")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "搜索消息组" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建目录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "消息组 独立消息的操作" })).toBeTruthy();
  });

  it("uses source message activity for each row and aggregates all messages", () => {
    const now = new Date("2026-09-07T12:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const props = panelProps({ filters: [
      createFilter(1, { name: "两小时前", latestMessageAt: new Date(now - 2 * 3_600_000).toISOString(), lastEngagedAt: new Date(now - 10_000).toISOString(), lastEngagementType: "marked_read" }),
      createFilter(2, { name: "刚收到", latestMessageAt: new Date(now - 20_000).toISOString() }),
      createFilter(3, { name: "还未命中" }),
    ] });
    const { rerender } = render(<FilterPanel {...props} />);
    const time = selection("两小时前").querySelector("time")!;
    expect(time.textContent).toBe("2 小时前");
    expect(time.title).toBeTruthy();
    expect(time.getAttribute("aria-label")).toMatch(/^最新消息：/);
    expect(selection("全部消息").querySelector("time")?.dateTime).toBe(props.filters[2].latestMessageAt);
    expect(selection("还未命中").textContent).toContain("暂无消息");
    const dateTime = time.dateTime;
    rerender(<FilterPanel {...props} filters={props.filters.map((filter) => ({ ...filter, lastEngagedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }))} />);
    expect(selection("两小时前").querySelector("time")?.dateTime).toBe(dateTime);
  });

  it("preserves the saved independent-block and all-messages positions", () => {
    render(<FilterPanel {...panelProps({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      ungroupedPosition: 0,
      filters: [
        createFilter(1, { name: "独立消息", manualSortOrder: 0 }),
        createFilter(2, { name: "第二组", manualGroupId: 1, manualSortOrder: 0 }),
        allMessages({ manualGroupId: 1, manualSortOrder: 1 }),
      ],
    })} />);
    const directory = screen.getByRole("heading", { name: "本季在追" }).closest("section")!;
    expect(directory.textContent!.indexOf("第二组")).toBeLessThan(directory.textContent!.indexOf("全部消息"));
    const list = screen.getByRole("navigation", { name: "消息组与目录" });
    expect(list.textContent!.indexOf("独立消息")).toBeLessThan(list.textContent!.indexOf("本季在追"));
    expect(screen.getAllByText("全部消息")).toHaveLength(1);
  });

  it("creates a directory with inline validation inside the anchored popover", async () => {
    const user = userEvent.setup();
    const props = panelProps({ filterGroups: [createGroup(1, { name: "本季在追" })] });
    render(<FilterPanel {...props} />);
    await user.click(screen.getByRole("button", { name: "新建目录" }));
    const popover = await screen.findByRole("dialog", { name: "新建目录" });
    const input = within(popover).getByRole("textbox", { name: "目录名称" });
    await user.click(within(popover).getByRole("button", { name: "创建目录" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "请输入名称");
    await user.type(input, "本季在追");
    await user.click(within(popover).getByRole("button", { name: "创建目录" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "目录名称已存在");
    await user.clear(input);
    await user.type(input, "以后再看");
    await user.click(within(popover).getByRole("button", { name: "创建目录" }));
    await waitFor(() => expect(props.onCreateGroup).toHaveBeenCalledWith("以后再看"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建目录" }));
  });

  it("keeps rename drafts through message updates and API failures", async () => {
    const user = userEvent.setup();
    const rename = vi.fn().mockRejectedValueOnce(new Error("保存失败"));
    const props = panelProps({ filterGroups: [createGroup(1, { name: "本季在追" })], onRenameGroup: rename });
    const { rerender } = render(<FilterPanel {...props} />);
    await openMenu(user, "本季在追", "目录");
    await user.click(screen.getByRole("button", { name: "重命名" }));
    const input = screen.getByRole("textbox", { name: "目录名称" });
    await user.clear(input);
    await user.type(input, "周末再看");
    rerender(<FilterPanel {...props} filters={props.filters.map((filter) => ({ ...filter, latestMessageAt: new Date().toISOString() }))} />);
    expect(screen.getByRole("textbox", { name: "目录名称" })).toBe(input);
    expect(input).toHaveProperty("value", "周末再看");
    await user.click(screen.getByRole("button", { name: "保存名称" }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(1, "周末再看"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "保存失败");
    expect(input).toHaveProperty("value", "周末再看");
  });

  it("routes message-group editing to rules and protects system all-messages actions", async () => {
    const user = userEvent.setup();
    const edit = vi.fn();
    const props = panelProps({ filters: [createFilter(1, { name: "重骑士" })], onEditFilter: edit });
    render(<FilterPanel {...props} />);
    const ordinaryMenu = await openMenu(user, "重骑士");
    expect(within(ordinaryMenu).queryByRole("button", { name: "重命名" })).toBeNull();
    expect(within(ordinaryMenu).queryByRole("textbox", { name: "消息组名称" })).toBeNull();
    await user.click(within(ordinaryMenu).getByRole("button", { name: "编辑监听规则" }));
    expect(edit).toHaveBeenCalledExactlyOnceWith(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const systemMenu = await openMenu(user, "全部消息");
    expect(within(systemMenu).queryByRole("button", { name: "重命名" })).toBeNull();
    expect(within(systemMenu).queryByRole("button", { name: "编辑监听规则" })).toBeNull();
    expect(within(systemMenu).getByRole("button", { name: "移动到目录" })).toBeTruthy();
  });

  it("moves ordinary and system rows using directory buttons without native selects", async () => {
    const user = userEvent.setup();
    const props = panelProps({ filterGroups: [createGroup(1, { name: "本季在追" })], filters: [createFilter(1, { name: "重骑士", manualGroupId: 1 })] });
    render(<FilterPanel {...props} />);
    await openMenu(user, "重骑士");
    await user.click(screen.getByRole("button", { name: "移动到目录" }));
    expect(screen.queryByRole("combobox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "独立显示" }));
    await waitFor(() => expect(props.onSetPlacement).toHaveBeenCalledWith(1, null, undefined));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openMenu(user, "全部消息");
    await user.click(screen.getByRole("button", { name: "移动到目录" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "本季在追" }));
    await waitFor(() => expect(props.onSetPlacement).toHaveBeenCalledWith(99, 1, undefined));
  });

  it("preserves a pending move error when its row changes directory optimistically", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [filters, setFilters] = useState([allMessages(), createFilter(1, { name: "重骑士", manualGroupId: 1 })]);
      return <FilterPanel {...panelProps({
        filters,
        filterGroups: [createGroup(1, { name: "本季在追" })],
        onSetPlacement: async (id, groupId) => {
          setFilters((current) => current.map((filter) => filter.id === id ? { ...filter, manualGroupId: groupId } : filter));
          await Promise.resolve();
          throw new Error("移动失败，请重试");
        },
      })} />;
    }
    render(<Harness />);
    await openMenu(user, "重骑士");
    await user.click(screen.getByRole("button", { name: "移动到目录" }));
    await user.click(screen.getByRole("button", { name: "独立显示" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "移动失败，请重试");
  });

  it("keeps message-group ordering open for successive moves and updates boundary actions", async () => {
    const user = userEvent.setup();
    const firstSave = deferred();
    const save = vi.fn().mockImplementationOnce(() => firstSave.promise).mockResolvedValue(undefined);
    function Harness() {
      const [filters, setFilters] = useState([
        allMessages(),
        createFilter(1, { name: "第一组", manualGroupId: 1, manualSortOrder: 0 }),
        createFilter(2, { name: "第二组", manualGroupId: 1, manualSortOrder: 1 }),
        createFilter(3, { name: "第三组", manualGroupId: 1, manualSortOrder: 2 }),
      ]);
      return <FilterPanel {...panelProps({
        filterGroups: [createGroup(1, { name: "本季在追" })],
        filters,
        onSetPlacement: async (id, groupId, index) => {
          // Match useFilters: rows reorder optimistically while the request is pending.
          setFilters((current) => moveFilterInManualOrder(current, id, groupId, index));
          await save(id, groupId, index);
        },
      })} />;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "消息组 第三组的操作" });
    const popup = await openMenu(user, "第三组");
    const up = within(popup).getByRole("button", { name: "上移" });
    const down = within(popup).getByRole("button", { name: "下移" });

    await user.click(up);
    expect(save).toHaveBeenCalledWith(3, 1, 1);
    expect(up).toHaveProperty("disabled", true);
    expect(down).toHaveProperty("disabled", true);
    expect(screen.getByRole("dialog", { name: "第三组" })).toBe(popup);
    await user.click(up);
    await user.click(down);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => firstSave.resolve());
    await waitFor(() => expect(up).toHaveProperty("disabled", false));
    expect(screen.getByRole("button", { name: "消息组 第三组的操作" })).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(up);
    await user.click(up);
    await waitFor(() => expect(save).toHaveBeenNthCalledWith(2, 3, 1, 0));
    await waitFor(() => expect(down).toHaveProperty("disabled", false));
    expect(up).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(down);
    expect(screen.getByRole("dialog", { name: "第三组" })).toBe(popup);

    await user.click(down);
    await waitFor(() => expect(save).toHaveBeenNthCalledWith(3, 3, 1, 1));
    await waitFor(() => expect(up).toHaveProperty("disabled", false));
    expect(screen.getByRole("dialog", { name: "第三组" })).toBe(popup);
    const directory = screen.getByRole("heading", { name: "本季在追" }).closest("section")!;
    expect([...directory.querySelectorAll("[data-filter-id]")].map((row) => row.getAttribute("data-filter-id"))).toEqual(["1", "3", "2"]);
  });

  it("keeps directory ordering errors in place and supports retry without reopening", async () => {
    const user = userEvent.setup();
    const firstSave = deferred();
    const save = vi.fn().mockImplementationOnce(() => firstSave.promise).mockResolvedValue(undefined);
    function Harness() {
      const [groups, setGroups] = useState([
        createGroup(1, { name: "本季在追" }),
        createGroup(2, { name: "长期更新" }),
      ]);
      const [independentPosition, setIndependentPosition] = useState(2);
      return <FilterPanel {...panelProps({
        filterGroups: groups,
        ungroupedPosition: independentPosition,
        onReorderGroups: async (input: FilterGroupOrderInput) => {
          await save(input);
          setGroups((current) => current.map((group) => ({ ...group, sortOrder: input.ids.indexOf(group.id) })));
          setIndependentPosition(input.ungroupedPosition ?? input.ids.length);
        },
      })} />;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "目录 长期更新的操作" });
    const popup = await openMenu(user, "长期更新", "目录");
    const up = within(popup).getByRole("button", { name: "上移" });
    const down = within(popup).getByRole("button", { name: "下移" });
    await user.click(up);
    expect(save).toHaveBeenCalledWith({ ids: [2, 1], ungroupedPosition: 2 });
    expect(up).toHaveProperty("disabled", true);
    expect(down).toHaveProperty("disabled", true);
    await user.click(down);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => firstSave.reject(new Error("保存顺序失败")));
    expect(await within(popup).findByRole("alert")).toHaveProperty("textContent", "保存顺序失败");
    expect(screen.getByRole("dialog", { name: "长期更新" })).toBe(popup);
    expect(up).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(up);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["本季在追", "长期更新"]);

    await user.click(up);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(down).toHaveProperty("disabled", false));
    expect(up).toHaveProperty("disabled", true);
    expect(within(popup).queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(down);
    expect(screen.getByRole("button", { name: "目录 长期更新的操作" })).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["长期更新", "本季在追"]);

    await user.click(down);
    await waitFor(() => expect(save).toHaveBeenNthCalledWith(3, { ids: [1, 2], ungroupedPosition: 2 }));
    await waitFor(() => expect(up).toHaveProperty("disabled", false));
    expect(screen.getByRole("dialog", { name: "长期更新" })).toBe(popup);
  });

  it("confirms directory deletion in the same anchored popover", async () => {
    const user = userEvent.setup();
    const props = panelProps({ filterGroups: [createGroup(1, { name: "本季在追" })] });
    render(<FilterPanel {...props} />);
    await openMenu(user, "本季在追", "目录");
    await user.click(screen.getByRole("button", { name: "删除目录" }));
    const popover = screen.getByRole("dialog", { name: "删除目录" });
    expect(within(popover).getByText(/消息组会独立显示，消息不会删除/)).toBeTruthy();
    expect(props.onDeleteGroup).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(popover).getByRole("button", { name: "删除目录" }));
    await waitFor(() => expect(props.onDeleteGroup).toHaveBeenCalledWith(1));
  });

  it("supports folder search, temporarily revealing collapsed matches", async () => {
    const user = userEvent.setup();
    render(<FilterPanel {...panelProps({
      filterGroups: [createGroup(1, { name: "本季在追" }), createGroup(2, { name: "待整理" })],
      filters: [createFilter(1, { name: "重骑士", manualGroupId: 1 }), createFilter(2, { name: "随手记录" })],
    })} />);
    await user.click(screen.getByRole("button", { name: "收起目录 本季在追" }));
    expect(screen.queryByText("重骑士")).toBeNull();
    await user.type(screen.getByRole("searchbox", { name: "搜索消息组" }), "重骑士");
    expect(screen.getByText("重骑士")).toBeTruthy();
    expect(screen.queryByText("随手记录")).toBeNull();
    await user.click(screen.getByRole("button", { name: "清空消息组搜索" }));
    expect(screen.queryByText("重骑士")).toBeNull();
    expect(screen.getByRole("heading", { name: "待整理" })).toBeTruthy();
    expect(screen.getByText("暂无消息组")).toBeTruthy();
  });

  it("returns Escape focus to the row and uses the supplied rule navigation", async () => {
    const user = userEvent.setup();
    const edit = vi.fn();
    render(<FilterPanel {...panelProps({ filters: [createFilter(1, { name: "重骑士" })], onEditFilter: edit })} />);
    const trigger = screen.getByRole("button", { name: "消息组 重骑士的操作" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{ArrowDown}{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await openMenu(user, "重骑士");
    await user.click(screen.getByRole("button", { name: "编辑监听规则" }));
    expect(edit).toHaveBeenCalledWith(1);
  });

  it("computes menu ordering without changing unrelated identifiers", () => {
    expect(reorderIds([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(reorderIds([1, 2, 3], 2, 2)).toBeNull();
    expect(reorderIds([1, 2, 3], 9, 1)).toBeNull();
  });
});
