// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

const updateState = vi.hoisted(() => ({
  updateReady: false,
  refresh: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@/shared/pwa/useServiceWorkerUpdate", () => ({
  useServiceWorkerUpdate: () => updateState,
}));

describe("PwaUpdatePrompt", () => {
  beforeEach(() => {
    updateState.updateReady = false;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("stays absent until an update is ready", () => {
    render(<PwaUpdatePrompt />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces the update without taking focus and only refreshes on request", async () => {
    const user = userEvent.setup();
    updateState.updateReady = true;
    render(<><input aria-label="正在编辑" autoFocus /><PwaUpdatePrompt /></>);

    expect(screen.getByRole("status").textContent).toContain("新版本可用");
    expect(document.activeElement).toBe(screen.getByLabelText("正在编辑"));
    expect(updateState.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "刷新" }));
    expect(updateState.refresh).toHaveBeenCalledTimes(1);
    expect(updateState.dismiss).not.toHaveBeenCalled();
  });

  it("can defer the update without activating it", async () => {
    const user = userEvent.setup();
    updateState.updateReady = true;
    render(<PwaUpdatePrompt />);

    await user.click(screen.getByRole("button", { name: "暂不刷新" }));
    expect(updateState.dismiss).toHaveBeenCalledTimes(1);
    expect(updateState.refresh).not.toHaveBeenCalled();
  });
});
