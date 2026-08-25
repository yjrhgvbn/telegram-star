// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter, FilterGroup } from "@/types";
import { FilterPanel } from "./FilterPanel";
import { reorderSortableIds } from "./FilterPanelSortable";

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

function createAllMessagesFilter(patch: Partial<Filter> = {}): Filter {
  return createFilter(99, {
    name: "全部消息",
    systemKey: "all_messages",
    conditions: [],
    enabled: false,
    ...patch,
  });
}

function createGroup(id: number, patch: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id,
    name: `分组 ${id}`,
    sortOrder: id - 1,
    filterCount: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function renderPanel({
  filters = [],
  filterGroups = [],
  ungroupedPosition = filterGroups.length,
  onSetFocused = vi.fn(),
  onCreateGroup = vi.fn(),
  onRenameGroup = vi.fn(),
  onDeleteGroup = vi.fn(),
  onReorderGroups = vi.fn(),
  onSetPlacement = vi.fn(),
}: {
  filters?: Filter[];
  filterGroups?: FilterGroup[];
  ungroupedPosition?: number;
  onSetFocused?: ReturnType<typeof vi.fn>;
  onCreateGroup?: ReturnType<typeof vi.fn>;
  onRenameGroup?: ReturnType<typeof vi.fn>;
  onDeleteGroup?: ReturnType<typeof vi.fn>;
  onReorderGroups?: ReturnType<typeof vi.fn>;
  onSetPlacement?: ReturnType<typeof vi.fn>;
} = {}) {
  const messageGroups = filters.some((filter) => filter.systemKey === "all_messages")
    ? filters
    : [createAllMessagesFilter(), ...filters];
  render(
    <MemoryRouter>
      <FilterPanel
        filters={messageGroups}
        filterGroups={filterGroups}
        ungroupedPosition={ungroupedPosition}
        loading={false}
        selectedFilterId=""
        onSelectFilter={vi.fn()}
        onSetFocused={onSetFocused}
        onCreateGroup={onCreateGroup}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={onDeleteGroup}
        onReorderGroups={onReorderGroups}
        onSetPlacement={onSetPlacement}
      />
    </MemoryRouter>,
  );
}

async function enterManageMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "配置分组列表" }));
}

describe("FilterPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses manual groups as the default ownership hierarchy", () => {
    const now = new Date(2026, 7, 9, 12, 0, 0).getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    renderPanel({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      filters: [
        createFilter(1, {
          name: "有归属的番剧",
          manualGroupId: 1,
          latestMessageAt: new Date(now - 2 * 3_600_000).toISOString(),
        }),
        createFilter(2, { name: "暂未整理" }),
      ],
    });

    const ownedSection = screen.getByRole("heading", { name: "本季在追" }).closest("section");
    const ungroupedSection = screen.getByRole("heading", { name: "未分组" }).closest("section");
    expect(ownedSection?.textContent).toContain("有归属的番剧");
    expect(within(ownedSection!).getByText("2 小时前")).toBeTruthy();
    expect(within(ungroupedSection!).getByRole("button", { name: /全部消息/ })).toBeTruthy();
    expect(ungroupedSection?.textContent).toContain("暂未整理");
    expect(within(ungroupedSection!).getByText("2")).toBeTruthy();
    expect(screen.queryByText("所有已追踪内容")).toBeNull();
    expect(screen.queryByRole("button", { name: "新建规则" })).toBeNull();
    expect(screen.getByRole("tab", { name: "我的分组" }).getAttribute("data-active")).not.toBeNull();
  });

  it("uses the same compact header control height as other workspace tabs", () => {
    renderPanel();

    const search = screen.getByRole("searchbox", { name: "搜索消息组" });
    const configureButton = screen.getByRole("button", { name: "配置分组列表" });
    const tabs = screen.getByRole("tablist");

    expect(search.className).toContain("h-9");
    expect(search.className).not.toContain("h-11");
    expect(configureButton.className).toContain("size-9");
    expect(configureButton.className).not.toContain("size-11");
    expect(tabs.className).toContain("h-9!");
  });

  it("replaces tabs with a same-height organize toolbar", async () => {
    const user = userEvent.setup();
    renderPanel();

    await enterManageMode(user);

    expect(screen.queryByRole("tablist")).toBeNull();
    const organizeLabel = screen.getByText(/整理我的分组/);
    expect(organizeLabel.parentElement?.className).toContain("h-9");
    expect(screen.getByRole("button", { name: "新建分组" })).toBeTruthy();
  });

  it("keeps focused and recent follow-up as separate flat views", async () => {
    const now = new Date(2026, 7, 9, 12, 0, 0).getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const onSetFocused = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({
      onSetFocused,
      filters: [
        createFilter(1, {
          name: "重点番剧",
          isFocused: true,
          lastEngagedAt: new Date(now - 4 * 3_600_000).toISOString(),
          lastEngagementType: "marked_read",
          lastEngagedMessageId: 11,
        }),
        createFilter(2, {
          name: "刚刚打开",
          lastEngagedAt: new Date(now - 3_600_000).toISOString(),
          lastEngagementType: "opened_telegram",
          lastEngagedMessageId: 22,
        }),
        createFilter(3, {
          name: "消息很新但未跟进",
          latestMessageAt: new Date(now - 30_000).toISOString(),
        }),
      ],
    });

    await user.click(screen.getByRole("tab", { name: "重点关注" }));
    const focusedSection = screen.getByRole("heading", { name: "重点关注" }).closest("section");
    expect(focusedSection?.textContent).toContain("重点番剧");
    expect(focusedSection?.textContent).not.toContain("刚刚打开");

    await user.click(screen.getByRole("tab", { name: "最近跟进" }));
    const recentSection = screen.getByRole("heading", { name: "最近跟进" }).closest("section");
    const recentText = recentSection?.textContent ?? "";
    expect(within(recentSection!).getByText("1 小时前")).toBeTruthy();
    expect(within(recentSection!).getByText("4 小时前")).toBeTruthy();
    expect(recentText).not.toContain("消息很新但未跟进");

    await enterManageMode(user);
    await user.click(screen.getByRole("button", { name: "设为重点关注 刚刚打开" }));
    await waitFor(() => expect(onSetFocused).toHaveBeenCalledWith(2, true));
  });

  it("creates, renames, exposes drag handles, and safely deletes manual groups", async () => {
    const user = userEvent.setup();
    const onCreateGroup = vi.fn().mockResolvedValue(undefined);
    const onRenameGroup = vi.fn().mockResolvedValue(undefined);
    const onDeleteGroup = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      filterGroups: [
        createGroup(1, { name: "本季在追", sortOrder: 0 }),
        createGroup(2, { name: "长期更新", sortOrder: 1 }),
      ],
      onCreateGroup,
      onRenameGroup,
      onDeleteGroup,
    });

    await enterManageMode(user);
    expect(screen.queryByRole("button", { name: "新建规则" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "以后再看");
    await user.click(screen.getByRole("button", { name: "保存新分组" }));
    await waitFor(() => expect(onCreateGroup).toHaveBeenCalledWith("以后再看"));

    await user.click(screen.getByRole("button", { name: "管理分组 本季在追" }));
    await user.click(screen.getByRole("button", { name: "重命名" }));
    const renameInput = screen.getByRole("textbox", { name: "重命名分组 本季在追" });
    await user.clear(renameInput);
    await user.type(renameInput, "重点补完");
    await user.click(screen.getByRole("button", { name: "保存分组名称 本季在追" }));
    await waitFor(() => expect(onRenameGroup).toHaveBeenCalledWith(1, "重点补完"));

    expect(screen.getByRole("button", { name: "拖拽分组 本季在追" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "拖拽分组 长期更新" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "拖拽分组 未分组" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "管理分组 长期更新" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/会移到“未分组”/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "删除分组" }));
    await waitFor(() => expect(onDeleteGroup).toHaveBeenCalledWith(2));
  });

  it("shows accessible drag and placement controls for message groups", async () => {
    const user = userEvent.setup();
    renderPanel({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      filters: [
        createFilter(1, { name: "第一组", manualGroupId: 1, manualSortOrder: 0 }),
        createFilter(2, { name: "第二组", manualGroupId: 1, manualSortOrder: 1 }),
      ],
    });

    await enterManageMode(user);
    expect(screen.queryByRole("button", { name: /编辑过滤/ })).toBeNull();
    expect(screen.getByRole("button", { name: "拖拽消息组 第一组" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "拖拽消息组 第二组" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "拖拽消息组 全部消息" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "移动消息组 第二组" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "移动消息组 全部消息" })).toBeTruthy();
  });

  it("moves a message group from a dialog instead of expanding the row", async () => {
    const user = userEvent.setup();
    const onSetPlacement = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      filters: [createFilter(2, { name: "第二组", manualGroupId: 1 })],
      onSetPlacement,
    });

    await enterManageMode(user);
    await user.click(screen.getByRole("button", { name: "移动消息组 第二组" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "移动“第二组”" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "所属分组 第二组" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "未分组" }));
    await waitFor(() => expect(onSetPlacement).toHaveBeenCalledWith(2, null, undefined));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("moves all messages like a protected message group", async () => {
    const user = userEvent.setup();
    const onSetPlacement = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      onSetPlacement,
    });

    await enterManageMode(user);
    await user.click(screen.getByRole("button", { name: "移动消息组 全部消息" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "移动“全部消息”" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "本季在追" }));
    await waitFor(() => {
      expect(onSetPlacement).toHaveBeenCalledWith(99, 1, undefined);
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("renders all messages at its persisted group and item position", () => {
    renderPanel({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      filters: [
        createFilter(2, { name: "第二组", manualGroupId: 1, manualSortOrder: 0 }),
        createAllMessagesFilter({ manualGroupId: 1, manualSortOrder: 1 }),
      ],
    });

    const groupSection = screen.getByRole("heading", { name: "本季在追" }).closest("section");
    const groupText = groupSection?.textContent ?? "";
    expect(groupText.indexOf("第二组")).toBeLessThan(groupText.indexOf("全部消息"));
    const ungroupedSection = screen.getByRole("heading", { name: "未分组" }).closest("section");
    expect(ungroupedSection?.textContent).not.toContain("全部消息");
  });

  it("places the protected ungrouped section at its persisted position", () => {
    renderPanel({
      filterGroups: [createGroup(1, { name: "本季在追" })],
      ungroupedPosition: 0,
    });

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["未分组", "本季在追"]);
  });

  it("computes sortable order without changing unrelated identifiers", () => {
    expect(reorderSortableIds([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(reorderSortableIds([1, 2, 3], 2, 2)).toBeNull();
    expect(reorderSortableIds([1, 2, 3], 9, 1)).toBeNull();
    expect(reorderSortableIds(["group:1", "ungrouped"], "ungrouped", "group:1"))
      .toEqual(["ungrouped", "group:1"]);
  });

  it("collapses manual sections without giving all messages a separate hierarchy", async () => {
    const user = userEvent.setup();
    renderPanel({
      filters: [createFilter(1, { name: "普通消息组" })],
    });

    const ungroupedSection = screen.getByRole("heading", { name: "未分组" }).closest("section");
    expect(within(ungroupedSection!).getByRole("button", { name: /全部消息/ })).toBeTruthy();
    expect(within(ungroupedSection!).getByRole("button", { name: /普通消息组/ })).toBeTruthy();

    await user.type(screen.getByRole("searchbox", { name: "搜索消息组" }), "普通");
    expect(within(ungroupedSection!).getByText("1")).toBeTruthy();
    expect(within(ungroupedSection!).queryByRole("button", { name: /全部消息/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "清空消息组搜索" }));

    await user.click(screen.getByRole("button", { name: "收起分组 未分组" }));
    expect(within(ungroupedSection!).queryByRole("button", { name: /全部消息/ })).toBeNull();
    expect(screen.getByRole("button", { name: "展开分组 未分组" })).toBeTruthy();
  });
});
