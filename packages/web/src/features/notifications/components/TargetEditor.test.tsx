// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter, ForwardTarget } from "@/types";
import { TargetEditor } from "./TargetEditor";
import type { EditableForwardTarget } from "../types";

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

function createTarget(patch: Partial<ForwardTarget> = {}): ForwardTarget {
  return {
    id: 1,
    name: "值班群",
    appriseUrl: "dingtalk://old-token",
    enabled: true,
    filterIds: [1],
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...patch,
  };
}

function renderTargetEditor({
  target = createTarget(),
  allFilters = [createFilter(), createFilter({ id: 2, name: "动漫" })],
  onDraftChange = vi.fn(),
  onSave = vi.fn().mockResolvedValue(createTarget()),
  onDelete = vi.fn().mockResolvedValue(undefined),
  onTest = vi.fn().mockResolvedValue({ success: true }),
}: {
  target?: EditableForwardTarget;
  allFilters?: Filter[];
  onDraftChange?: (target: EditableForwardTarget | null) => void;
  onSave?: Parameters<typeof TargetEditor>[0]["onSave"];
  onDelete?: Parameters<typeof TargetEditor>[0]["onDelete"];
  onTest?: Parameters<typeof TargetEditor>[0]["onTest"];
} = {}) {
  render(
    <TargetEditor
      target={target}
      allFilters={allFilters}
      onDraftChange={onDraftChange}
      onSave={onSave}
      onDelete={onDelete}
      onTest={onTest}
    />,
  );

  return { onDraftChange, onSave, onDelete, onTest };
}

describe("TargetEditor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("saves trimmed fields, enabled state, and selected filters", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTargetEditor();

    await user.clear(screen.getByPlaceholderText("例如：研发群 / 飞书值班群"));
    await user.type(screen.getByPlaceholderText("例如：研发群 / 飞书值班群"), "  动漫值班  ");
    await user.clear(screen.getByPlaceholderText("dingtalk://Token / discord://ID/Token"));
    await user.type(
      screen.getByPlaceholderText("dingtalk://Token / discord://ID/Token"),
      "  discord://channel/token  ",
    );
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "动漫" }));
    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      {
        name: "动漫值班",
        appriseUrl: "discord://channel/token",
        enabled: false,
        filterIds: [1, 2],
      },
    );
  });

  it("sends a test notification and shows the success notice", async () => {
    const user = userEvent.setup();
    const { onTest } = renderTargetEditor();

    await user.click(screen.getByRole("button", { name: /测试/ }));

    await waitFor(() => expect(onTest).toHaveBeenCalledWith("dingtalk://old-token"));
    expect(await screen.findByText("测试消息已发送")).not.toBeNull();
  });

  it("requires a second click before deleting an existing target", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderTargetEditor();

    await user.click(screen.getByLabelText("删除通道"));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /确认删除/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 })));
  });
});
