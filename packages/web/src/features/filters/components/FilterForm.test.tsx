// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter, ForwardTarget } from "@/types";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
} from "@telegram-star/shared/contracts/forward-targets";
import { FilterForm } from "./FilterForm";

function createFilter(patch: Partial<Filter> = {}): Filter {
  return {
    id: 1,
    name: "测试标题",
    conditions: [{ type: "keyword", values: ["测试标题"] }],
    enabled: true,
    autoLocateUnreadNearRead: true,
    forwardTargetIds: [1],
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...patch,
  };
}

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
  onDelete,
}: {
  onAutoLocateChange: (value: boolean) => void;
  onToggleForwardTarget: (id: number) => void;
  onAddCondition: () => void;
  onDelete: () => void;
}) {
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);

  return (
    <FilterForm
      selectedFilter={createFilter({ autoLocateUnreadNearRead })}
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
      saving={false}
      onUpdateCondition={vi.fn()}
      onRemoveCondition={vi.fn()}
      onAppendValues={vi.fn()}
      onAddCondition={onAddCondition}
      onDelete={onDelete}
    />
  );
}

describe("FilterForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("handles editing, auto-locate toggling, actions, and delete confirmation", async () => {
    const user = userEvent.setup();
    const onAutoLocateChange = vi.fn();
    const onToggleForwardTarget = vi.fn();
    const onAddCondition = vi.fn();
    const onDelete = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={onAutoLocateChange}
        onToggleForwardTarget={onToggleForwardTarget}
        onAddCondition={onAddCondition}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("已启用 2 项")).not.toBeNull();
    expect(screen.getByText("规则速览")).not.toBeNull();
    expect(screen.getByText("如果")).not.toBeNull();
    expect(screen.getByText("那么")).not.toBeNull();
    expect(screen.getByText("来源：2 个会话")).not.toBeNull();
    expect(screen.getByText("关键词：将夜")).not.toBeNull();
    expect(screen.getByText("通知：1 个通道")).not.toBeNull();
    expect(screen.getByText("始终开启")).not.toBeNull();

    await user.click(screen.getByRole("switch", { name: "打开时自动定位未读" }));
    expect(onAutoLocateChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("checkbox", { name: "备份通道 · 停用" }));
    expect(onToggleForwardTarget).toHaveBeenCalledWith(2);

    await user.click(
      screen.getByRole("button", { name: "添加一个必须同时满足的条件" }),
    );
    expect(onAddCondition).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /^删除$/ }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /确认删除/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
