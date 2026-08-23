// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterConfirmationDialog } from "./FilterConfirmationDialog";

describe("FilterConfirmationDialog", () => {
  it("confirms destructive rule deletion without a browser-native dialog", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <FilterConfirmationDialog
        kind="delete"
        filterName="重要消息"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("alertdialog").textContent).toContain("删除规则“重要消息”？");
    await user.click(screen.getByRole("button", { name: "删除规则" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("reports cancellation when the user keeps an unsaved draft", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <FilterConfirmationDialog
        kind="discard"
        filterName=""
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "返回上一页后，当前页面中的修改将不会保留。",
    );
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
