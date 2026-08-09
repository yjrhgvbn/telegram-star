// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";

describe("PreviewPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lets the user expand the preview scan range", async () => {
    const user = userEvent.setup();
    const onPreviewLimitChange = vi.fn();

    render(
      <PreviewPanel
        previewEnabled
        previewLoading={false}
        previewStale={false}
        previewError=""
        previewMessages={[]}
        previewSummary={{ scannedChats: 1, total: 0 }}
        previewLimit="200"
        onPreviewLimitChange={onPreviewLimitChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "预览扫描范围" }));
    await user.click(await screen.findByRole("option", { name: "最近 1,000 条 / 会话" }));

    expect(onPreviewLimitChange).toHaveBeenCalledWith("1000");
  });
});
