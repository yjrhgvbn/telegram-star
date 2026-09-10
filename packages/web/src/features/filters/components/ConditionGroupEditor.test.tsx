// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftCondition, DraftConditionGroup } from "../types";
import { normalizeConditions } from "../utils";
import { ConditionGroupEditor } from "./ConditionGroupEditor";

const initialConditions: DraftCondition[] = [
  { id: "first", groupId: "group-1", type: "keyword", values: ["新番", "更新"], input: "" },
];

function EditorHarness({
  conditions = initialConditions,
  onRemoveGroup = vi.fn(),
}: {
  conditions?: DraftCondition[];
  onRemoveGroup?: (groupId: string) => void;
}) {
  const [group, setGroup] = useState<DraftConditionGroup>({ id: "group-1", effect: "require", conditions });
  const update = (id: string, updater: (condition: DraftCondition) => DraftCondition) => {
    setGroup((current) => ({ ...current, conditions: current.conditions.map((condition) => condition.id === id ? updater(condition) : condition) }));
  };
  return (
    <ConditionGroupEditor
      group={group}
      index={1}
      chats={[{ id: "anime", title: "ANi" }, { id: "news", title: "新闻" }]}
      chatsLoading={false}
      removable
      onUpdateCondition={update}
      onRemoveCondition={(id) => setGroup((current) => ({ ...current, conditions: current.conditions.filter((condition) => condition.id !== id) }))}
      onRemoveGroup={onRemoveGroup}
      onToggleEffect={() => setGroup((current) => ({ ...current, effect: current.effect === "require" ? "exclude" : "require" }))}
      onAppendValues={(id) => update(id, (condition) => ({
        ...condition,
        values: normalizeConditions([condition])[0]?.values ?? [],
        input: "",
      }))}
      onAddAlternative={() => setGroup((current) => ({
        ...current,
        conditions: [...current.conditions, {
          id: `added-${current.conditions.length}`,
          groupId: current.id,
          type: "keyword",
          values: [],
          input: "",
        }],
      }))}
    />
  );
}

describe("ConditionGroupEditor", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("edits sender IDs with multiline paste, validates input and clears values when changing type", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);
    await user.click(screen.getByRole("combobox", { name: "消息内容匹配方式" }));
    await user.click(await screen.findByRole("option", { name: "发送者用户 ID" }));
    expect(screen.queryByText("新番")).toBeNull();
    const field = screen.getByRole("textbox", { name: "发送者用户 ID" });
    await user.click(field);
    await user.paste("123456789\n987654321");
    await user.keyboard("{Enter}");
    expect(screen.getByText("123456789")).not.toBeNull();
    expect(screen.getByText("987654321")).not.toBeNull();
    await user.type(field, "@user");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("用户 ID 无效");

    await user.click(screen.getByRole("combobox", { name: "消息内容匹配方式" }));
    await user.click(await screen.findByRole("option", { name: "关键词包含" }));
    expect(screen.queryByText("123456789")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("textbox", { name: "关键词" }) as HTMLInputElement).value).toBe("");
  });

  it("supports repeated additions and keeps focus in the new field after confirming a value", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.click(screen.getByRole("button", { name: "添加条件" }));
    let fields = screen.getAllByRole("textbox", { name: "关键词" });
    expect(fields).toHaveLength(2);
    expect(document.activeElement).toBe(fields[1]);
    await user.type(fields[1], "1080P{Enter}");
    expect(screen.getByText("1080P")).not.toBeNull();
    expect(document.activeElement).toBe(fields[1]);
    expect((fields[1] as HTMLInputElement).value).toBe("");

    await user.click(screen.getByRole("button", { name: "添加条件" }));
    fields = screen.getAllByRole("textbox", { name: "关键词" });
    expect(fields).toHaveLength(3);
    expect(document.activeElement).toBe(fields[2]);
    expect(screen.getAllByText("或")).toHaveLength(3);
  });

  it("deletes the first condition from the group menu and resumes editing its surviving sibling", async () => {
    const user = userEvent.setup();
    const onRemoveGroup = vi.fn();
    render(<EditorHarness onRemoveGroup={onRemoveGroup} conditions={[
      ...initialConditions,
      { id: "second", groupId: "group-1", type: "regex", values: ["更新.*1080P"], input: "" },
    ]} />);

    await user.click(screen.getByRole("button", { name: "条件组操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除首项条件" }));
    expect(screen.queryByText("新番")).toBeNull();
    expect(screen.getByText("更新.*1080P")).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "正则表达式" })));
    expect(onRemoveGroup).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "条件组操作" }));
    expect(screen.queryByRole("menuitem", { name: "删除首项条件" })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: "删除条件组" }));
    expect(onRemoveGroup).toHaveBeenCalledWith("group-1");
  });

  it("keeps values while toggling the whole group and changing keyword matching to a regex", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);
    await user.click(screen.getByRole("button", { name: "当前为必须满足，点击切换为整组排除" }));
    const group = screen.getByRole("region", { name: "排除条件组" });
    expect(within(group).getByText("新番")).not.toBeNull();
    expect(within(group).getByText("更新")).not.toBeNull();

    await user.click(screen.getByRole("combobox", { name: "消息内容匹配方式" }));
    await user.click(await screen.findByRole("option", { name: "正则匹配" }));
    expect(within(group).getByRole("textbox", { name: "正则表达式" })).not.toBeNull();
    expect(within(group).getByText("新番")).not.toBeNull();
    expect(within(group).getByRole("button", { name: "当前为整组排除，点击切换为必须满足" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("retains the source search dialog and selection behavior", async () => {
    const user = userEvent.setup();
    render(<EditorHarness conditions={[{ id: "source", type: "chat", values: [], input: "" }]} />);
    expect(screen.queryByText("未指定会话时，匹配全部会话")).toBeNull();
    await user.click(screen.getByRole("button", { name: "全部会话" }));
    const dialog = screen.getByRole("dialog", { name: "选择会话" });
    await user.type(within(dialog).getByRole("searchbox", { name: "搜索会话" }), "ANi");
    expect(within(dialog).queryByRole("button", { name: /新闻/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /^ANi\s*anime$/ }));
    await user.click(within(dialog).getByRole("button", { name: "完成" }));
    expect(screen.getByRole("button", { name: "已选 1 个会话：ANi" })).not.toBeNull();
  });

  it("only shows actual syntax errors and never executes JavaScript while rendering", async () => {
    const user = userEvent.setup();
    render(<EditorHarness conditions={[{ id: "regex", type: "regex", values: [], input: "" }]} />);
    expect(screen.queryByRole("alert")).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "正则表达式" }), "(");
    expect(screen.getByRole("alert").textContent).toContain("正则表达式无效");
    await user.clear(screen.getByRole("textbox", { name: "正则表达式" }));
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "消息内容匹配方式" }));
    await user.click(await screen.findByRole("option", { name: "JavaScript" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "JavaScript 代码" }), "throw new Error('must not execute');");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/空项不参与|原型不执行/)).toBeNull();
  });
});
