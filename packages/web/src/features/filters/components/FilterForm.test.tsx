// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForwardTarget } from "@/types";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
} from "@telegram-star/shared/contracts/forward-targets";
import type { DraftCondition } from "../types";
import { FilterForm } from "./FilterForm";

function createForwardTarget(id: number, patch: Partial<ForwardTarget> = {}): ForwardTarget {
  return {
    id,
    name: `通道-${id}`,
    appriseUrl: `test://${id}`,
    enabled: true,
    filterIds: [1],
    titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    createdAt: `2026-06-29T00:00:0${id}.000Z`,
    updatedAt: `2026-06-29T00:00:0${id}.000Z`,
    ...patch,
  };
}

function FilterFormHarness({
  onAutoLocateChange,
  onToggleForwardTarget,
  onAddCondition,
  onAddAlternative = vi.fn(),
  onToggleGroupEffect = vi.fn(),
  conditions,
  onUpdateCondition = vi.fn(),
  onRemoveCondition = vi.fn(),
  onRemoveGroup = vi.fn(),
}: {
  onAutoLocateChange: (value: boolean) => void;
  onToggleForwardTarget: (id: number) => void;
  onAddCondition: () => void;
  onAddAlternative?: (groupId: string) => void;
  onToggleGroupEffect?: (groupId: string) => void;
  conditions?: DraftCondition[];
  onUpdateCondition?: (
    id: string,
    updater: (condition: DraftCondition) => DraftCondition,
  ) => void;
  onRemoveCondition?: (id: string) => void;
  onRemoveGroup?: (groupId: string) => void;
}) {
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);

  return (
    <FilterForm
      autoLocateUnreadNearRead={autoLocateUnreadNearRead}
      onAutoLocateChange={(value) => {
        setAutoLocateUnreadNearRead(value);
        onAutoLocateChange(value);
      }}
      chats={[
        { id: "chat-1", title: "动漫抢先看" },
        { id: "chat-2", title: "VAM 国漫精品社区" },
      ]}
      chatsLoading={false}
      forwardTargets={[
        createForwardTarget(1, { name: "值班群" }),
        createForwardTarget(2, { name: "备份通道", enabled: false }),
      ]}
      selectedForwardTargetIds={[1]}
      forwardTargetsLoading={false}
      onToggleForwardTarget={onToggleForwardTarget}
      onCreateForwardTarget={vi.fn()}
      conditions={conditions ?? [
        {
          id: "chat-condition",
          type: "chat",
          values: ["chat-1", "chat-2"],
          input: "",
        },
        {
          id: "keyword-condition",
          type: "keyword",
          values: ["将夜"],
          input: "",
        },
      ]}
      onUpdateCondition={onUpdateCondition}
      onRemoveCondition={onRemoveCondition}
      onRemoveGroup={onRemoveGroup}
      onToggleGroupEffect={onToggleGroupEffect}
      onAppendValues={vi.fn()}
      onAddAlternative={onAddAlternative}
      onAddCondition={onAddCondition}
    />
  );
}

describe("FilterForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps conditions separate and handles the remaining actions", async () => {
    const user = userEvent.setup();
    const onAutoLocateChange = vi.fn();
    const onToggleForwardTarget = vi.fn();
    const onAddCondition = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={onAutoLocateChange}
        onToggleForwardTarget={onToggleForwardTarget}
        onAddCondition={onAddCondition}
      />,
    );

    expect(screen.getByRole("region", { name: "匹配条件" })).not.toBeNull();
    const notificationSummary = screen.getByText("命中后通知").closest("summary")!;
    expect(within(notificationSummary).getByText("值班群")).not.toBeNull();
    expect(notificationSummary.closest("details")?.open).toBe(false);
    expect(screen.getByText("打开消息时").closest("details")?.open).toBe(false);

    await user.click(screen.getByText("打开消息时"));
    await user.click(screen.getByRole("switch", { name: /自动定位待完成/ }));
    expect(onAutoLocateChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("按浏览位置")).not.toBeNull();

    await user.click(notificationSummary);
    await user.click(screen.getByRole("checkbox", { name: "备份通道" }));
    expect(onToggleForwardTarget).toHaveBeenCalledWith(2);

    await user.click(
      screen.getByRole("button", { name: "添加条件组" }),
    );
    expect(onAddCondition).toHaveBeenCalledTimes(1);
  });

  it("shows an empty chat scope as all chats and keeps the primary scope row", async () => {
    const user = userEvent.setup();

    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        conditions={[
          { id: "chat-condition", type: "chat", values: [], input: "" },
          { id: "keyword-condition", type: "keyword", values: [], input: "" },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "全部会话" })).not.toBeNull();
    expect(within(screen.getByRole("region", { name: "消息来源" })).queryByRole("button", { name: "条件组操作" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /消息来源/ })).toBeNull();

    await user.click(
      screen.getByRole("combobox", { name: "消息内容匹配方式" }),
    );
    expect(
      await screen.findByRole("option", { name: "关键词包含" }),
    ).not.toBeNull();
    expect(
      await screen.findByRole("option", { name: "正则匹配" }),
    ).not.toBeNull();
    expect(
      await screen.findByRole("option", { name: "JavaScript" }),
    ).not.toBeNull();
    expect(screen.queryByRole("option", { name: /排除/ })).toBeNull();
    expect(screen.queryByRole("option", { name: "来自任一会话" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "全部会话" }));
    expect(screen.getByRole("dialog", { name: "选择会话" })).not.toBeNull();
    expect(screen.getByText("当前匹配全部会话")).not.toBeNull();
    await user.type(screen.getByRole("searchbox", { name: "搜索会话" }), "动漫");
    expect(screen.getByRole("button", { name: /^动漫抢先看\s*chat-1$/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^VAM 国漫精品社区\s*chat-2$/ })).toBeNull();
    expect(screen.getByRole("button", { name: "在已加入会话的消息中查找“动漫”" })).not.toBeNull();
  });

  it("can clear selected chats back to the implicit all-chat scope", async () => {
    const user = userEvent.setup();
    const onUpdateCondition = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        onUpdateCondition={onUpdateCondition}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /已选 2 个会话/ }),
    );
    await user.click(screen.getByRole("button", { name: "改为全部会话" }));

    const [conditionId, updater] = onUpdateCondition.mock.calls[0] as [
      string,
      (condition: DraftCondition) => DraftCondition,
    ];
    expect(conditionId).toBe("chat-condition");
    expect(
      updater({
        id: "chat-condition",
        type: "chat",
        values: ["chat-1", "chat-2"],
        input: "",
      }).values,
    ).toEqual([]);
  });

  it("renders a script condition as an editable code area", () => {
    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        conditions={[
          { id: "chat-condition", type: "chat", values: [], input: "" },
          {
            id: "script-condition",
            type: "script",
            values: [],
            input: "return message.content.includes('红包');",
          },
        ]}
      />,
    );

    expect(
      (screen.getByRole("textbox", { name: "JavaScript 代码" }) as HTMLTextAreaElement).value,
    ).toBe("return message.content.includes('红包');");
  });

  it("toggles the whole group effect from the left rail", async () => {
    const user = userEvent.setup();
    const onToggleGroupEffect = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        onToggleGroupEffect={onToggleGroupEffect}
      />,
    );

    const effectToggle = screen.getByRole("button", {
      name: "当前为必须满足，点击切换为整组排除",
    });
    expect(effectToggle.getAttribute("aria-pressed")).toBe("false");

    await user.click(effectToggle);

    expect(onToggleGroupEffect).toHaveBeenCalledWith("keyword-condition");
  });

  it("changes only the content type and preserves an exclusion effect", async () => {
    const user = userEvent.setup();
    const onUpdateCondition = vi.fn();
    const source: DraftCondition = {
      id: "keyword-condition",
      type: "keyword",
      effect: "exclude",
      values: ["广告"],
      input: "临时值",
    };

    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        onUpdateCondition={onUpdateCondition}
        conditions={[
          { id: "chat-condition", type: "chat", values: [], input: "" },
          source,
        ]}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "当前为整组排除，点击切换为必须满足",
      }).getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(screen.getByRole("combobox", { name: "消息内容匹配方式" }));
    await user.click(await screen.findByRole("option", { name: "JavaScript" }));

    const [, updater] = onUpdateCondition.mock.calls[0] as [
      string,
      (condition: DraftCondition) => DraftCondition,
    ];
    expect(updater(source)).toEqual({
      ...source,
      type: "script",
      values: [],
      input: "",
    });
  });

  it("renders OR alternatives inside the same group and adds to that group", async () => {
    const user = userEvent.setup();
    const onAddAlternative = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        onAddAlternative={onAddAlternative}
        conditions={[
          {
            id: "chat-condition",
            groupId: "source-group",
            type: "chat",
            values: [],
            input: "",
          },
          {
            id: "keyword-condition",
            groupId: "content-group",
            type: "keyword",
            values: ["红包"],
            input: "",
          },
          {
            id: "regex-condition",
            groupId: "content-group",
            type: "regex",
            values: ["返佣.*300"],
            input: "",
          },
        ]}
      />,
    );

    expect(screen.getByText("或")).not.toBeNull();
    expect(screen.getAllByRole("combobox", { name: "消息内容匹配方式" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "添加条件" }));
    expect(onAddAlternative).toHaveBeenCalledWith("content-group");
  });

  it("removes the selected alternative or the whole group through their own actions", async () => {
    const user = userEvent.setup();
    const onRemoveCondition = vi.fn();
    const onRemoveGroup = vi.fn();
    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
        onRemoveCondition={onRemoveCondition}
        onRemoveGroup={onRemoveGroup}
        conditions={[
          {
            id: "chat-condition",
            groupId: "source-group",
            type: "chat",
            values: [],
            input: "",
          },
          {
            id: "keyword-condition",
            groupId: "content-group",
            type: "keyword",
            values: ["红包"],
            input: "",
          },
          {
            id: "regex-condition",
            groupId: "content-group",
            type: "regex",
            values: ["返佣.*300"],
            input: "",
          },
        ]}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: /删除.*备选条件/,
    });
    expect(removeButtons).toHaveLength(1);
    await user.click(removeButtons[0]);
    expect(onRemoveCondition).toHaveBeenCalledWith("regex-condition");
    expect(onRemoveGroup).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "条件组操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除条件组" }));
    expect(onRemoveGroup).toHaveBeenCalledWith("content-group");
  });
});
