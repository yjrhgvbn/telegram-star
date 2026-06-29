// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "@/types";
import { FilterForm } from "./FilterForm";

function createFilter(patch: Partial<Filter> = {}): Filter {
  return {
    id: 1,
    name: "将夜",
    conditions: [{ type: "keyword", values: ["将夜"] }],
    enabled: true,
    autoLocateUnreadNearRead: true,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...patch,
  };
}

function FilterFormHarness({
  onAutoLocateChange,
  onAddCondition,
  onSave,
  onDelete,
  onToggle,
}: {
  onAutoLocateChange: (value: boolean) => void;
  onAddCondition: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [name, setName] = useState("将夜");
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
    const onAddCondition = vi.fn();
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onToggle = vi.fn();

    render(
      <FilterFormHarness
        onAutoLocateChange={onAutoLocateChange}
        onAddCondition={onAddCondition}
        onSave={onSave}
        onDelete={onDelete}
        onToggle={onToggle}
      />,
    );

    const nameInput = screen.getByPlaceholderText("例如：BTC 讨论 / Solana 频道观察") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "动漫更新");
    expect(nameInput.value).toBe("动漫更新");

    await user.click(screen.getByRole("switch", { name: /自动定位未读/ }));
    expect(onAutoLocateChange).toHaveBeenCalledWith(false);

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
