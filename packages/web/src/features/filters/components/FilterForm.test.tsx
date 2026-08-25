// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
      error=""
      onUpdateCondition={onUpdateCondition}
      onRemoveCondition={vi.fn()}
      onRemoveGroup={vi.fn()}
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

    expect(screen.getByRole("region", { name: "命中条件" })).not.toBeNull();
    expect(screen.getByText("发送通知")).not.toBeNull();
    expect(screen.getByText("已选 1 个")).not.toBeNull();
    expect(screen.queryByText("判断是否命中")).toBeNull();
    expect(screen.queryByText("规则速览")).toBeNull();
    expect(screen.queryByText("保存消息")).toBeNull();

    await user.click(screen.getByRole("switch", { name: "打开时自动定位未读" }));
    expect(onAutoLocateChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("checkbox", { name: "备份通道 · 停用" }));
    expect(onToggleForwardTarget).toHaveBeenCalledWith(2);

    await user.click(
      screen.getByRole("button", { name: "添加必须条件" }),
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
    expect(screen.getByText("来自任一会话")).not.toBeNull();
    expect(screen.getByText("未指定会话时，匹配全部会话")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "删除消息来源条件" })).toBeNull();
    expect(screen.getByRole("button", { name: "删除消息内容条件组" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: /消息来源/ })).toBeNull();

    await user.click(
      screen.getByRole("combobox", { name: "消息内容匹配方式" }),
    );
    expect(
      await screen.findByRole("option", { name: "关键词" }),
    ).not.toBeNull();
    expect(
      await screen.findByRole("option", { name: "正则表达式" }),
    ).not.toBeNull();
    expect(
      await screen.findByRole("option", { name: "JavaScript" }),
    ).not.toBeNull();
    expect(screen.queryByRole("option", { name: /排除/ })).toBeNull();
    expect(screen.queryByRole("option", { name: "来自任一会话" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "全部会话" }));
    expect(screen.getByText("当前匹配全部会话")).not.toBeNull();
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
    expect(screen.getByText(/可读取 message\.chatId 和 message\.content/)).not.toBeNull();
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

  it("renders alternatives inside one group with an explicit OR divider", async () => {
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

    expect(screen.getByText("或者")).not.toBeNull();
    expect(screen.getAllByRole("combobox", { name: "消息内容匹配方式" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "备选条件" }));
    expect(onAddAlternative).toHaveBeenCalledWith("content-group");
  });

  it("keeps the alternative remove action beside the type selector on narrow screens", () => {
    render(
      <FilterFormHarness
        onAutoLocateChange={vi.fn()}
        onToggleForwardTarget={vi.fn()}
        onAddCondition={vi.fn()}
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
    expect(removeButtons).toHaveLength(2);
    for (const button of removeButtons) {
      expect(button.className).toContain("col-start-2");
      expect(button.className).toContain("sm:col-start-3");
      expect(button.className).toContain("row-start-1");
    }
  });
});
