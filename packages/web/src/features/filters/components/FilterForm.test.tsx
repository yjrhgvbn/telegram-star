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
  onSave,
  onDelete,
  onToggle,
}: {
  onAutoLocateChange: (value: boolean) => void;
  onToggleForwardTarget: (id: number) => void;
  onAddCondition: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [name, setName] = useState("测试标题");
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);

  return (
    <FilterForm
      selectedFilter={createFilter({ name, autoLocateUnreadNearRead })}
      name={name}
      onNameChange={setName}
      autoLocateUnreadNearRead={autoLocateUnreadNearRead}
      onAutoLocateChange={(value) => {
        setAutoLocateUnreadNearRead(value);
        onAutoLocateChange(value);
      }}
      forwardTargets={[
        createForwardTarget(1, { name: "值班群" }),
        createForwardTarget(2, { name: "备份通道", enabled: false }),
      ]}
      selectedForwardTargetIds={[1]}
      forwardTargetsLoading={false}
      onToggleForwardTarget={onToggleForwardTarget}
      onCreateForwardTarget={vi.fn()}
      conditions={[]}
      error=""
      saving={false}
      onUpdateCondition={vi.fn()}
      onRemoveCondition={vi.fn()}
      onAppendKeywords={vi.fn()}
      onAddCondition={onAddCondition}
      onSave={onSave}
      onDelete={onDelete}
      onToggle={onToggle}
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
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onToggle = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={onAutoLocateChange}
        onToggleForwardTarget={onToggleForwardTarget}
        onAddCondition={onAddCondition}
        onSave={onSave}
        onDelete={onDelete}
        onToggle={onToggle}
      />,
    );

    const nameInput = screen.getByPlaceholderText("例如：项目公告 / 值班提醒观察") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "动漫更新");
    expect(nameInput.value).toBe("动漫更新");

    await user.click(screen.getByRole("switch", { name: /自动定位未读/ }));
    expect(onAutoLocateChange).toHaveBeenCalledWith(false);

    expect(screen.getByText("1 个转发通道")).not.toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "备份通道 · 停用" }));
    expect(onToggleForwardTarget).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole("button", { name: /添加/ }));
    expect(onAddCondition).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /保存修改/ }));
    expect(onSave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /停用过滤器/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /^删除$/ }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /确认删除/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
