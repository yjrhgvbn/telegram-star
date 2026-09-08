// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types";
import { MessageRemovalDialog } from "./MessageRemovalDialog";

afterEach(cleanup);
const message = (id: number, rules: number[]) => ({ id, matchedFilterId: rules[0], filterName: `规则 ${rules[0]}`,
  filterMatches: rules.map((filterId) => ({ filterId, filterName: `规则 ${filterId}`, matchedKeyword: null })),
}) as Message;

describe("MessageRemovalDialog", () => {
  it("defaults to allowing manual backfill and resets that choice on the next operation", () => {
    const submit = vi.fn();
    const props = { messages: [message(1, [1])], initialFilter: { id: 1, name: "规则 1" }, pending: false, error: null, onClose: vi.fn(), onSubmit: submit };
    const view = render(<MessageRemovalDialog {...props} />);
    const checkbox = screen.getByRole("checkbox", { name: "此规则以后补录时也跳过" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "移除 1 条" }));
    expect(submit).toHaveBeenCalledWith({ filterId: 1, filterName: "规则 1", ids: [1], blockBackfill: true });
    view.unmount();
    render(<MessageRemovalDialog {...props} />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("requires a rule in all messages and sends only selected rows belonging to that rule", () => {
    const submit = vi.fn();
    render(<MessageRemovalDialog messages={[message(1, [1, 2]), message(2, [2])]} pending={false} error={null} onClose={vi.fn()} onSubmit={submit} />);
    expect((screen.getByRole("button", { name: "移除 0 条" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("combobox", { name: "目标规则" }));
    fireEvent.click(screen.getByRole("option", { name: "规则 1" }));
    expect(screen.getByText("已选 2 条，其中 1 条属于此规则；本次仅移除这 1 条。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "移除 1 条" }));
    expect(submit).toHaveBeenCalledWith({ filterId: 1, filterName: "规则 1", ids: [1], blockBackfill: false });
  });

  it("keeps errors in the dialog and locks dismissal and options while submitting", () => {
    const close = vi.fn();
    const props = { messages: [message(1, [1])], pending: false, error: "离线，请重试", onClose: close, onSubmit: vi.fn() };
    const view = render(<MessageRemovalDialog {...props} />);
    expect(screen.getByRole("alert").textContent).toBe("离线，请重试");
    fireEvent.click(screen.getByRole("button", { name: "移除 1 条" }));
    view.rerender(<MessageRemovalDialog {...props} pending />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });
});
