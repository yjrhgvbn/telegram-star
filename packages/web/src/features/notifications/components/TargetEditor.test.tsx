// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter, ForwardTarget } from "@/types";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  FORWARD_FORMAT_PRESETS,
} from "@telegram-star/shared/contracts/forward-targets";
import { TargetEditor } from "./TargetEditor";
import type { EditableForwardTarget } from "../types";
import { createDraftTarget } from "../types";

function createFilter(patch: Partial<Filter> = {}): Filter {
  return {
    id: 1,
    name: "测试标题",
    conditions: [{ type: "keyword", values: ["测试标题"] }],
    enabled: true,
    autoLocateUnreadNearRead: true,
    forwardTargetIds: [1],
    latestMessageAt: null,
    isFocused: false,
    lastEngagedAt: null,
    lastEngagementType: null,
    lastEngagedMessageId: null,
    manualGroupId: null,
    manualSortOrder: 0,
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
    titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
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

    await user.click(screen.getByRole("button", { name: "编辑通道名称" }));
    await user.clear(screen.getByRole("textbox", { name: "通道名称" }));
    await user.type(screen.getByRole("textbox", { name: "通道名称" }), "  动漫值班  ");
    await user.clear(screen.getByRole("textbox", { name: "Apprise 地址" }));
    await user.type(
      screen.getByRole("textbox", { name: "Apprise 地址" }),
      "  discord://channel/token  ",
    );
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("checkbox", { name: "接收 动漫" }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      {
        name: "动漫值班",
        appriseUrl: "discord://channel/token",
        enabled: false,
        filterIds: [1, 2],
        titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
        bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
      },
    );
  });

  it("enables save only after editing an existing channel and disables it again after saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(createTarget({ enabled: false }));
    renderTargetEditor({ onSave });
    const save = screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.click(screen.getByRole("switch"));
    expect(save.disabled).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(save);
    await waitFor(() => expect(save.disabled).toBe(true));
    expect(screen.queryByText("未保存")).toBeNull();
  });

  it("allows validation for an untouched new channel", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTargetEditor({ target: createDraftTarget() });
    const save = screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await user.click(save);
    expect(screen.getByText("请填写通道名称")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("applies a built-in format preset and updates the live preview", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTargetEditor();
    const markdownPreset = FORWARD_FORMAT_PRESETS.find((preset) => preset.id === "markdown");

    await user.click(screen.getByRole("tab", { name: "消息格式" }));
    await user.click(screen.getByRole("button", { name: "Markdown", exact: true }));

    expect((screen.getByLabelText("标题模板") as HTMLInputElement).value).toBe(markdownPreset?.titleTemplate);
    expect((screen.getByLabelText("正文模板") as HTMLTextAreaElement).value).toBe(markdownPreset?.bodyTemplate);
    expect(
      screen.getAllByText((content) => content.includes("**群组**：追踪频道")).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "保存", exact: true }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({
        titleTemplate: markdownPreset?.titleTemplate,
        bodyTemplate: markdownPreset?.bodyTemplate,
      }),
    );
  });

  it("sends a test notification and shows the success notice", async () => {
    const user = userEvent.setup();
    const { onTest } = renderTargetEditor();

    await user.click(screen.getByRole("button", { name: "发送测试" }));

    await waitFor(() =>
      expect(onTest).toHaveBeenCalledWith({
        appriseUrl: "dingtalk://old-token",
        titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
        bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
      }),
    );
    expect(await screen.findByText("测试消息已发送")).not.toBeNull();
  });

  it("requires confirmation from the channel menu before deleting an existing target", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderTargetEditor();

    await user.click(screen.getByRole("button", { name: "更多通道操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除通道" }));
    expect(await screen.findByRole("alertdialog")).not.toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /确认删除/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 })));
  });

  it("searches, filters, and bulk-selects a large rule list without leaving the workbench", async () => {
    const user = userEvent.setup();
    renderTargetEditor({
      allFilters: [
        createFilter(),
        createFilter({
          id: 2,
          name: "动漫",
          conditions: [{ type: "keyword", values: ["新番", "动画"] }],
          forwardTargetIds: [],
        }),
        createFilter({
          id: 3,
          name: "价格提醒",
          conditions: [{ type: "regex", values: ["BTC.*USD"] }],
          forwardTargetIds: [],
        }),
      ],
    });

    const search = screen.getByRole("searchbox", { name: "搜索订阅规则" });
    await user.type(search, "动画");

    expect(await screen.findByRole("checkbox", { name: "接收 动漫" })).not.toBeNull();
    expect(screen.queryByRole("checkbox", { name: "接收 价格提醒" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "选择当前结果" }));
    expect((screen.getByRole("checkbox", { name: "接收 动漫" }) as HTMLInputElement).checked).toBe(true);

    await user.clear(search);
    await user.click(screen.getByRole("button", { name: /^未选/ }));
    expect(screen.queryByRole("checkbox", { name: "接收 动漫" })).toBeNull();
    expect(await screen.findByRole("checkbox", { name: "接收 价格提醒" })).not.toBeNull();
  });

  it("keeps unsaved address and template edits when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("保存暂时失败"));
    renderTargetEditor({ onSave });

    const address = screen.getByRole("textbox", { name: "Apprise 地址" }) as HTMLInputElement;
    expect(address.value).toBe("dingtalk://old-token");
    await user.clear(address);
    await user.type(address, "discord://new-channel/new-token");
    await user.click(screen.getByRole("tab", { name: "消息格式" }));
    const title = screen.getByLabelText("标题模板") as HTMLInputElement;
    await user.clear(title);
    await user.type(title, "我的标题");
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByText("保存暂时失败")).not.toBeNull();
    expect(address.value).toBe("discord://new-channel/new-token");
    expect(title.value).toBe("我的标题");
    expect(screen.getByText("未保存")).not.toBeNull();
    expect((screen.getByRole("button", { name: "保存", exact: true }) as HTMLButtonElement).disabled).toBe(false);
    onSave.mockResolvedValueOnce(createTarget({ appriseUrl: address.value, titleTemplate: title.value }));
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("未保存")).toBeNull();
  });

  it("focuses an empty address without leaving the active task or calling save/test", async () => {
    const user = userEvent.setup();
    const { onSave, onTest } = renderTargetEditor();
    const address = screen.getByRole("textbox", { name: "Apprise 地址" }) as HTMLInputElement;
    await user.clear(address);
    await user.click(screen.getByRole("tab", { name: "消息格式" }));

    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    expect(screen.getByText("请填写 Apprise 地址")).not.toBeNull();
    expect(document.activeElement).toBe(address);
    expect(address.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("tab", { name: "消息格式" }).getAttribute("aria-selected")).toBe("true");
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "发送测试" }));
    expect(document.activeElement).toBe(address);
    expect(onTest).not.toHaveBeenCalled();
  });
});
