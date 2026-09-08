// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "@/types";
import { RuleSubscriptionWorkbench } from "./RuleSubscriptionWorkbench";

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `规则 ${id}`,
    conditions: [{ type: "keyword", values: [`关键词 ${id}`] }],
    systemKey: null,
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
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...patch,
  };
}

const filters = [
  createFilter(1, { name: "更新", conditions: [{ type: "chat", values: ["chat-1"] }] }),
  createFilter(2, {
    name: "追番",
    conditions: [
      { type: "chat", values: ["chat-2"] },
      { type: "keyword", values: ["将夜"], groupId: "content" },
      { type: "regex", values: ["第\\d+集"], groupId: "content" },
      { type: "keyword", values: ["广告"], effect: "exclude" },
    ],
  }),
  createFilter(3, { name: "价格提醒", enabled: false }),
];

function Harness({ initial = [1], onChange = vi.fn() }: {
  initial?: number[];
  onChange?: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <RuleSubscriptionWorkbench
      allFilters={filters}
      selectedFilterIds={selected}
      onSelectedFilterIdsChange={(ids) => { setSelected(ids); onChange(ids); }}
      chats={[{ id: "chat-1", title: "资讯频道" }, { id: "chat-2", title: "动漫更新" }]}
    />
  );
}

describe("RuleSubscriptionWorkbench", () => {
  afterEach(cleanup);

  it("distinguishes initial loading and failed loading from the real empty state", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const props = { allFilters: [], selectedFilterIds: [99], onSelectedFilterIdsChange: vi.fn(), onRetry };
    const { rerender } = render(<RuleSubscriptionWorkbench {...props} loading />);
    expect(screen.getByText("读取规则中")).toBeTruthy();
    expect(screen.queryByText("还没有可用规则")).toBeNull();
    rerender(<RuleSubscriptionWorkbench {...props} error="读取超时" />);
    expect(screen.getByRole("alert").textContent).toContain("读取超时");
    expect(screen.queryByText("还没有可用规则")).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试读取规则" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<RuleSubscriptionWorkbench {...props} />);
    expect(screen.getByText("还没有可用规则")).toBeTruthy();
    expect(props.onSelectedFilterIdsChange).not.toHaveBeenCalled();
  });

  it("keeps existing rules and subscriptions usable after a background read fails", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RuleSubscriptionWorkbench allFilters={filters} selectedFilterIds={[1, 99]} onSelectedFilterIdsChange={onChange} error="刷新失败" onRetry={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect((screen.getByRole("checkbox", { name: "接收 更新" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "接收 追番" }));
    expect(onChange).toHaveBeenCalledWith([1, 99, 2]);
  });

  it("limits bulk changes to matching rows and preserves other subscriptions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={[1, 99]} onChange={onChange} />);

    const search = screen.getByRole("searchbox", { name: "搜索订阅规则" });
    await user.type(search, "动漫更新");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "接收 追番" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "选择当前结果" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 99, 2]);
    await user.click(screen.getByRole("button", { name: "取消当前选择" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 99]);

    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "未选 2" }));
    await user.click(screen.getByRole("button", { name: "选择当前结果" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 99, 2, 3]);
    expect(screen.getByText("已选择全部规则")).not.toBeNull();
    expect((screen.getByRole("button", { name: "选择当前结果" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows readable grouped conditions without changing the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const peek = screen.getByRole("button", { name: "查看追番规则" });
    await user.click(peek);
    expect(peek.getAttribute("aria-expanded")).toBe("true");
    const details = document.getElementById(peek.getAttribute("aria-controls")!);
    expect(details?.textContent).toContain("动漫更新");
    expect(details?.textContent).toContain("或者");
    expect(details?.textContent).toContain("排除内容包含");
    expect(details?.textContent).toContain("广告");
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "接收 追番" }));
    expect(onChange).toHaveBeenCalledWith([1, 2]);
    expect(peek.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a scope selected and restores the list from empty searches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const selectedScope = screen.getByRole("button", { name: "已选 1" });
    await user.click(selectedScope);
    await user.click(selectedScope);
    expect(selectedScope.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    await user.type(screen.getByRole("searchbox"), "不存在的规则");
    expect(screen.getByText("没有找到规则")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "查看全部规则" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("已停用")).not.toBeNull();
  });
});
