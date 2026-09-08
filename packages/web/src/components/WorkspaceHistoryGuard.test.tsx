// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { WorkspaceHistoryGuardProvider, useWorkspaceHistoryGuard } from "./WorkspaceHistoryGuard";

afterEach(cleanup);

function Editor({ preserveWithin, initialBusy = false }: { preserveWithin?: string; initialBusy?: boolean }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(initialBusy);
  const location = useLocation();
  const navigate = useNavigate();
  useWorkspaceHistoryGuard({ dirty: Boolean(value), busy, preserveWithin });
  return <>
    <p data-testid="path">{location.pathname}</p>
    <input aria-label="草稿" value={value} onChange={e => setValue(e.target.value)} />
    <button onClick={() => setBusy(false)}>请求完成</button>
    <button onClick={() => navigate("/messages")}>已确认的主导航</button>
  </>;
}

function setup(entries: string[], initialIndex = entries.length - 1, options: { preserveWithin?: string; initialBusy?: boolean } = {}) {
  const router = createMemoryRouter([{ path: "*", element: <WorkspaceHistoryGuardProvider><Editor {...options} /></WorkspaceHistoryGuardProvider> }], { initialEntries: entries, initialIndex });
  render(<RouterProvider router={router} />);
  fireEvent.change(screen.getByLabelText("草稿"), { target: { value: "未保存内容" } });
  return router;
}

describe("WorkspaceHistoryGuard", () => {
  it("cancels a back navigation without losing the draft, then can confirm a retry", async () => {
    const router = setup(["/messages", "/filters/1"], 1, { preserveWithin: "/filters" });
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/filters/1");
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect((screen.getByLabelText("草稿") as HTMLInputElement).value).toBe("未保存内容");
    await act(() => router.navigate(-1));
    fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
  });

  it("also protects forward history navigation", async () => {
    const router = setup(["/settings/media", "/messages"], 0, { preserveWithin: "/settings" });
    await act(() => router.navigate(1));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/settings/media");
  });

  it("keeps a rule/category draft during internal history navigation", async () => {
    const router = setup(["/filters", "/filters/1"], 1, { preserveWithin: "/filters" });
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/filters");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("草稿") as HTMLInputElement).value).toBe("未保存内容");
  });

  it("still confirms switching forwarding channels through history", async () => {
    const router = setup(["/notifications/1", "/notifications/2"]);
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/notifications/2");
  });

  it("does not queue a back gesture until a mutation finishes", async () => {
    const router = setup(["/messages", "/settings/clients"], 1, { initialBusy: true });
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/settings/clients");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "请求完成" }));
    expect(router.state.location.pathname).toBe("/settings/clients");
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
  });

  it("does not add a second prompt to page-controlled push navigation", async () => {
    const router = setup(["/filters/1"]);
    fireEvent.click(screen.getByRole("button", { name: "已确认的主导航" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
