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
}: {
  onAutoLocateChange: (value: boolean) => void;
  onToggleForwardTarget: (id: number) => void;
  onAddCondition: () => void;
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
      conditions={[
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
      onUpdateCondition={vi.fn()}
      onRemoveCondition={vi.fn()}
      onAppendValues={vi.fn()}
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
      screen.getByRole("button", { name: "添加一个必须同时满足的条件" }),
    );
    expect(onAddCondition).toHaveBeenCalledTimes(1);
  });
});
