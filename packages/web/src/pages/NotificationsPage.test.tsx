// @vitest-environment jsdom
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ForwardTarget, ForwardTargetCreateInput } from "@/types";
import { createDraftTarget, type EditableForwardTarget } from "@/features/notifications/types";
import type { TargetEditor } from "@/features/notifications/components/TargetEditor";
import { NotificationsPage } from "./NotificationsPage";

const mocks = vi.hoisted(() => ({
  initialTargets: [] as ForwardTarget[],
  initialLoading: false,
  initialError: null as string | null,
  receiveTargets: (_targets: ForwardTarget[]) => {},
  refresh: vi.fn(),
  editorRenders: [] as { path: string; targetId: number }[],
  addTarget: vi.fn(),
  save: vi.fn<(target: EditableForwardTarget, data: ForwardTargetCreateInput) => Promise<ForwardTarget>>(),
  remove: vi.fn<(target: EditableForwardTarget) => Promise<void>>(),
}));

vi.mock("@/hooks/useAuthStatus", () => ({
  useAuthStatus: () => ({ authStatus: { authorized: true }, authLoading: false, handleLoginSuccess: vi.fn() }),
}));
vi.mock("@/hooks/useFilters", () => ({
  useFilters: () => ({ filters: [], chats: [], loading: false, error: null }),
}));
vi.mock("@/components/AppShell", () => ({ AppShell: MockAppShell }));
vi.mock("@/features/notifications", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/notifications")>(),
  useForwardTargets: useMockForwardTargets,
  TargetEditor: MockTargetEditor,
}));

function targetFixture(id: number, patch: Partial<ForwardTarget> = {}): ForwardTarget {
  return {
    ...createDraftTarget(),
    id,
    name: `通道 ${id}`,
    appriseUrl: `test://${id}`,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...patch,
  };
}

function useMockForwardTargets() {
  const [targets, setTargets] = useState(mocks.initialTargets);
  mocks.receiveTargets = setTargets;
  const [draft, setDraftTarget] = useState<EditableForwardTarget | null>(null);
  const addTarget = useCallback(() => {
    mocks.addTarget();
    setDraftTarget((current) => current ?? createDraftTarget());
  }, []);
  const setSelectedTargetId = useCallback(() => {}, []);
  const saveTarget = useCallback(async (target: EditableForwardTarget, data: ForwardTargetCreateInput) => {
    const saved = await mocks.save(target, data);
    setTargets((current) => target.id === 0
      ? [saved, ...current]
      : current.map((item) => item.id === saved.id ? saved : item));
    setDraftTarget(null);
    return saved;
  }, []);
  const deleteTarget = useCallback(async (target: EditableForwardTarget) => {
    await mocks.remove(target);
    if (target.id === 0) setDraftTarget(null);
    else setTargets((current) => current.filter((item) => item.id !== target.id));
  }, []);
  const visibleTargets = useMemo(() => draft ? [draft, ...targets] : targets, [draft, targets]);
  return {
    targets,
    visibleTargets,
    // Deliberately stale: the URL must determine what the user sees during a route change.
    selectedTarget: targets[0],
    selectedTargetId: "1",
    loading: mocks.initialLoading,
    error: mocks.initialError,
    addTarget,
    setDraftTarget,
    setSelectedTargetId,
    saveTarget,
    deleteTarget,
    testTarget: vi.fn(),
    refresh: mocks.refresh,
  };
}

function MockAppShell({ children, onNavigateRequest }: {
  children: ReactNode;
  onNavigateRequest: (action: () => void) => void;
}) {
  const navigate = useNavigate();
  return <>
    <button onClick={() => onNavigateRequest(() => navigate("/messages"))}>主导航消息</button>
    <button onClick={() => onNavigateRequest(() => navigate("/notifications"))}>主导航转发</button>
    {children}
  </>;
}

function MockTargetEditor({ target, onBack, onDraftChange, onDirtyChange, onBusyChange, onSave, onDelete }: Parameters<typeof TargetEditor>[0]) {
  const [name, setName] = useState(target.name);
  const location = useLocation();
  mocks.editorRenders.push({ path: location.pathname, targetId: target.id });
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  return <section aria-label="测试编辑器">
    <button onClick={onBack}>测试返回列表</button>
    <input aria-label="测试通道名称" value={name} onChange={(event) => {
      const next = event.currentTarget.value;
      setName(next);
      onDirtyChange?.(next !== target.name);
      if (target.id === 0) onDraftChange({ ...target, name: next });
    }} />
    <button onClick={async () => {
      onBusyChange?.(true);
      try { await onSave(target, {
        name,
        appriseUrl: target.appriseUrl,
        enabled: target.enabled,
        filterIds: target.filterIds,
        titleTemplate: target.titleTemplate,
        bodyTemplate: target.bodyTemplate,
      }); }
      finally { onBusyChange?.(false); }
    }}>测试保存</button>
    <button onClick={async () => {
      onBusyChange?.(true);
      try { await onDelete(target); }
      finally { onBusyChange?.(false); }
    }}>测试删除</button>
  </section>;
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="当前位置">{location.pathname}</output><button onClick={() => navigate(-1)}>浏览器返回</button></>;
}

function renderPage(path: string, history: string[] = []) {
  return render(<MemoryRouter initialEntries={[...history, path]}>
    <LocationProbe />
    <Routes>
      <Route path="/notifications/:targetId?" element={<NotificationsPage />} />
      <Route path="/messages" element={<p>消息页面</p>} />
    </Routes>
  </MemoryRouter>);
}

describe("NotificationsPage", () => {
  let mobile = false;
  let viewportListeners = new Set<() => void>();
  function resizeToMobile(next: boolean) {
    act(() => {
      mobile = next;
      viewportListeners.forEach((listener) => listener());
    });
  }

  beforeEach(() => {
    mocks.initialTargets = [targetFixture(1), targetFixture(2)];
    mocks.initialLoading = false;
    mocks.initialError = null;
    mocks.refresh.mockReset();
    mocks.editorRenders = [];
    mocks.addTarget.mockReset();
    mocks.save.mockReset().mockImplementation(async (target, data) => targetFixture(target.id || 3, data));
    mocks.remove.mockReset().mockResolvedValue();
    mobile = false;
    viewportListeners = new Set();
    vi.stubGlobal("matchMedia", () => ({
      get matches() { return mobile; },
      addEventListener: (_type: string, listener: () => void) => viewportListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => viewportListeners.delete(listener),
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("keeps the desktop root URL while displaying and selecting the first persisted channel", () => {
    renderPage("/notifications");
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1");
    expect(screen.getByRole("button", { name: /通道 1/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("searchbox", { name: "搜索转发通道" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "转发通道" })).toBeNull();
    expect(screen.queryByRole("button", { name: "刷新通道" })).toBeNull();
  });

  it("preserves the root editor when a delayed refetch prepends a new channel", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    let finishRefetch!: (targets: ForwardTarget[]) => void;
    const response = new Promise<ForwardTarget[]>((resolve) => { finishRefetch = resolve; });
    const refetch = response.then((targets) => mocks.receiveTargets(targets));
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 未保存");
    await act(async () => {
      finishRefetch([targetFixture(3), targetFixture(1), targetFixture(2)]);
      await refetch;
    });
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1 未保存");
    expect(screen.getByRole("button", { name: /通道 1/ }).getAttribute("aria-current")).toBe("page");
    await user.click(screen.getByRole("button", { name: "主导航消息" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("falls back after deleting a pinned root selection even after the list order changes", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    act(() => mocks.receiveTargets([targetFixture(3), targetFixture(1), targetFixture(2)]));
    await user.click(screen.getByRole("button", { name: "测试删除" }));
    expect(mocks.remove.mock.calls[0]?.[0].id).toBe(1);
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 3");
    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    await user.click(screen.getByRole("button", { name: "测试删除" }));
    await waitFor(() => expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications"));
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 3");
  });

  it("distinguishes a failed channel request from an empty or missing channel and offers retry", async () => {
    const user = userEvent.setup();
    mocks.initialTargets = [];
    mocks.initialError = "暂时无法连接";
    renderPage("/notifications/99");
    expect(screen.queryByText("还没有转发通道")).toBeNull();
    expect(screen.queryByText("该通道不存在，请选择其他通道")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "重试读取通道" })[0]!);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("retains channels and the draft when a background request fails", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 未保存");
    mocks.initialError = "刷新失败";
    act(() => mocks.receiveTargets([...mocks.initialTargets]));
    expect(screen.getByRole("alert").textContent).toContain("刷新失败");
    expect(screen.getByRole("button", { name: /通道 2/ })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1 未保存");
  });

  it("opens only the mobile list at the root and returns there through the main tab", async () => {
    const user = userEvent.setup();
    mobile = true;
    const { container } = renderPage("/notifications");
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect(screen.queryByRole("textbox", { name: "测试通道名称" })).toBeNull();
    expect(container.querySelector("main")?.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("button", { name: /通道 1/ }).hasAttribute("aria-current")).toBe(false);

    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/2");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 2");
    expect(screen.queryByRole("searchbox", { name: "搜索转发通道" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "主导航转发" }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect(screen.queryByRole("textbox", { name: "测试通道名称" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "搜索转发通道" })).toBeTruthy();
  });

  it("records an explicit desktop click on the default channel and keeps its detail open after resizing", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 未保存");
    await user.click(screen.getByRole("button", { name: /通道 1/ }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    resizeToMobile(true);
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1 未保存");
    expect(screen.queryByRole("searchbox", { name: "搜索转发通道" })).toBeNull();
  });

  it("preserves edits while resizing the root and opening that same channel from its mobile list", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 未保存");
    resizeToMobile(true);
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect(screen.queryByRole("textbox", { name: "测试通道名称" })).toBeNull();
    resizeToMobile(false);
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1 未保存");

    resizeToMobile(true);
    await user.click(screen.getByRole("button", { name: /通道 1/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/1");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1 未保存");
  });

  it("resets discarded edits when an explicit first-channel route returns to the same root detail", async () => {
    const user = userEvent.setup();
    renderPage("/notifications/1");
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 应当放弃");
    await user.click(screen.getByRole("button", { name: "主导航转发" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/1");
    await user.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 1");
    await user.click(screen.getByRole("button", { name: "主导航消息" }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/messages");
  });

  it("saves the derived first channel without promoting the root to a detail URL", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 已修改");
    await user.click(screen.getByRole("button", { name: "测试保存" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0].id).toBe(1);
    expect(mocks.save.mock.calls[0]?.[1].name).toBe("通道 1 已修改");
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/2");
  });

  it("blocks opening the hidden default detail until its pending save finishes", async () => {
    const user = userEvent.setup();
    let finishSave!: (target: ForwardTarget) => void;
    mocks.save.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    renderPage("/notifications");
    await user.click(screen.getByRole("button", { name: "测试保存" }));
    resizeToMobile(true);
    await user.click(screen.getByRole("button", { name: /通道 1/ }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    await act(async () => { finishSave(targetFixture(1)); });
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    await user.click(screen.getByRole("button", { name: /通道 1/ }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/1");
  });

  it("replaces a saved new draft with its actual detail route", async () => {
    const user = userEvent.setup();
    renderPage("/notifications/new");
    await user.type(await screen.findByRole("textbox", { name: "测试通道名称" }), "新增通道");
    await user.click(screen.getByRole("button", { name: "测试保存" }));
    await waitFor(() => expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/3"));
    expect(mocks.save.mock.calls[0]?.[0].id).toBe(0);
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("新增通道");
  });

  it("deletes the root's default channel, selects the next, and handles the final empty list", async () => {
    const user = userEvent.setup();
    renderPage("/notifications");
    await user.click(screen.getByRole("button", { name: "测试删除" }));
    expect(mocks.remove.mock.calls[0]?.[0].id).toBe(1);
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 2");
    expect(screen.getByRole("button", { name: /通道 2/ }).getAttribute("aria-current")).toBe("page");
    await user.click(screen.getByRole("button", { name: "测试删除" }));
    expect(mocks.remove.mock.calls[1]?.[0].id).toBe(2);
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect(screen.queryByRole("textbox", { name: "测试通道名称" })).toBeNull();
    expect(screen.getByText("新建一个转发通道")).toBeTruthy();
  });

  it.each([false, true])("keeps an empty root in place during loading=%s", loading => {
    mocks.initialTargets = [];
    mocks.initialLoading = loading;
    renderPage("/notifications");
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications");
    expect(screen.queryByRole("textbox", { name: "测试通道名称" })).toBeNull();
    expect(screen.getAllByText(loading ? "读取通道中" : "新建一个转发通道").length).toBeGreaterThan(0);
    expect(mocks.addTarget).not.toHaveBeenCalled();
  });

  it("does not substitute the first channel for a missing explicit route", () => {
    renderPage("/notifications/99");
    expect(screen.getByText("该通道不存在，请选择其他通道")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "测试通道名称" })).toBeNull();
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/99");
  });

  it("keeps one draft at /new, including when new is clicked again after editing", async () => {
    const user = userEvent.setup();
    renderPage("/notifications/new");
    const name = await screen.findByRole("textbox", { name: "测试通道名称" });
    await user.type(name, "持续编辑的草稿");
    await user.click(screen.getByRole("button", { name: "新建通道", exact: true }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((name as HTMLInputElement).value).toBe("持续编辑的草稿");
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/new");
    expect(mocks.addTarget).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: /持续编辑的草稿/ })).toHaveLength(1);
  });

  it("renders the URL's target without flashing the previously selected target", async () => {
    const user = userEvent.setup();
    renderPage("/notifications/1");
    await user.click(screen.getByRole("button", { name: /通道 2/ }));

    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/2");
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 2");
    const destinationRenders = mocks.editorRenders.filter((entry) => entry.path === "/notifications/2");
    expect(destinationRenders.length).toBeGreaterThan(0);
    expect(destinationRenders.every((entry) => entry.targetId === 2)).toBe(true);
  });

  it("asks before replacing edits with a new draft and keeps them when cancelled", async () => {
    const user = userEvent.setup();
    renderPage("/notifications/1");
    const name = screen.getByRole("textbox", { name: "测试通道名称" });
    await user.type(name, " 尚未保存");
    await user.click(screen.getByRole("button", { name: "新建通道", exact: true }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(mocks.addTarget).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect((name as HTMLInputElement).value).toBe("通道 1 尚未保存");

    await user.click(screen.getByRole("button", { name: "新建通道", exact: true }));
    await user.click(await screen.findByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/new"));
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("");
  });

  it("guards channel switching and clears a discarded draft", async () => {
    const user = userEvent.setup();
    renderPage("/notifications/new");
    await user.type(await screen.findByRole("textbox", { name: "测试通道名称" }), "要放弃的草稿");
    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/new");

    await user.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/2"));
    expect(screen.queryByRole("button", { name: /要放弃的草稿/ })).toBeNull();
    expect((screen.getByRole("textbox", { name: "测试通道名称" }) as HTMLInputElement).value).toBe("通道 2");
  });

  it("keeps the page in place while saving instead of accepting navigation requests", async () => {
    const user = userEvent.setup();
    let finishSave!: (target: ForwardTarget) => void;
    mocks.save.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    renderPage("/notifications/1");
    await user.click(screen.getByRole("button", { name: "测试保存" }));
    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    await user.click(screen.getByRole("button", { name: "主导航消息" }));

    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => { finishSave(targetFixture(1)); });
    await user.click(screen.getByRole("button", { name: /通道 2/ }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/2");
  });

  it.each(["/notifications/1", "/notifications"])("does not reopen %s after the browser leaves during a pending save", async path => {
    const user = userEvent.setup();
    let finishSave!: (target: ForwardTarget) => void;
    mocks.save.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    renderPage(path, ["/messages"]);
    await user.click(screen.getByRole("button", { name: "测试保存" }));
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    expect(screen.getByLabelText("当前位置").textContent).toBe("/messages");

    await act(async () => { finishSave(targetFixture(1)); });
    expect(screen.getByLabelText("当前位置").textContent).toBe("/messages");
  });

  it("does not let an older save clear edits made after history returns to the same channel", async () => {
    const user = userEvent.setup();
    let finishSave!: (target: ForwardTarget) => void;
    mocks.save.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    renderPage("/notifications/1", ["/notifications/1", "/notifications/2"]);
    await user.click(screen.getByRole("button", { name: "测试保存" }));
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    await user.click(screen.getByRole("button", { name: "浏览器返回" }));
    await user.type(screen.getByRole("textbox", { name: "测试通道名称" }), " 新的修改");
    await act(async () => { finishSave(targetFixture(1)); });
    await user.click(screen.getByRole("button", { name: "主导航消息" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByLabelText("当前位置").textContent).toBe("/notifications/1");
  });
});
