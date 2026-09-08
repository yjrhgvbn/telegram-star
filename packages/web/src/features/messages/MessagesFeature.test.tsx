// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import type { MessageList } from "./components/MessageList";

const mocks = vi.hoisted(() => ({useMessages: vi.fn(), apply: vi.fn(), remove: vi.fn()}));
vi.mock("./hooks/useMessages", () => ({useMessages: mocks.useMessages}));
vi.mock("./hooks/useMessageCompletion", () => ({useMessageCompletion: () => ({
  pendingIds: new Set(), error: null, apply: mocks.apply, toggle: vi.fn(), dismissError: vi.fn(),
})}));
vi.mock("@/hooks/useAuthStatus", () => ({useAuthStatus: () => ({authStatus: null, authLoading: false, handleLoginSuccess: vi.fn()})}));
vi.mock("@/hooks/useFilters", () => ({useFilters: () => ({
  filters: [{id: 1, name: "分组一"}, {id: 2, name: "分组二"}], messageGroups: [], loading: false,
  error: null, updateFilter: vi.fn(), setFilterPlacement: vi.fn(),
})}));
vi.mock("@/hooks/useFilterGroups", () => ({useFilterGroups: () => ({groups: [], loading: false})}));
vi.mock("@/components/AppShell", () => ({AppShell: ({children}: {children: ReactNode}) => <>{children}</>}));
vi.mock("./components/FilterPanel", () => ({FilterPanel: ({onSelectFilter}: {onSelectFilter: (id: string) => void}) => (
  <nav><button onClick={() => onSelectFilter("1")}>进入分组一</button><button onClick={() => onSelectFilter("2")}>进入分组二</button></nav>
)}));
vi.mock("./components/MessageList", () => ({MessageList: (props: ComponentProps<typeof MessageList>) => (
  <section data-message-scroll tabIndex={-1} aria-label="测试消息区域">
    <output data-testid="locate-request">{props.locateRequest}</output>
    <output data-testid="selected-messages">{Array.from(props.selectedIds ?? []).join(",")}</output>
    <button onClick={props.onLocateHandled}>确认定位完成</button>
    {props.messages.map(message => <button key={`remove-${message.id}`} onClick={() => props.onRemove?.(message.id)}>移除消息 {message.id}</button>)}
    {props.isSelecting && props.messages.map(message => <button key={message.id} onClick={() => props.onSelect?.(message.id)}>选择消息 {message.id}</button>)}
  </section>
)}));
import { MessagesFeature } from "./MessagesFeature";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
  mocks.apply.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue({ success: true, removedIds: [1], count: 1 });
  mocks.useMessages.mockImplementation((options: {filterId?: number}) => ({
    messages: [{id: options.filterId ?? 1, matchedFilterId: options.filterId ?? 1, filterName: "分组一", isRead: false}], hasOlder: false, hasNewer: false,
    loading: false, error: null, loadingOlder: false, loadingNewer: false, anchorId: null, restoredAnchorId: null,
    hasPendingNew: false, loadOlder: vi.fn(), loadNewer: vi.fn(), flushPending: vi.fn(), setAtBottom: vi.fn(),
    toggleRead: vi.fn(), recordTelegramOpen: vi.fn(), markAsReadLocal: vi.fn(), refresh: vi.fn(), removeMessages: mocks.remove,
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });
function mount() {
  return render(<MemoryRouter initialEntries={["/messages/1"]}><Routes><Route path="/messages/:filterId" element={<MessagesFeature />} /></Routes></MemoryRouter>);
}

describe("MessagesFeature integration", () => {
  it("removes a single row from its rule and reports the result in the page", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "移除消息 1" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("从“分组一”移除 1 条消息？");
    fireEvent.click(screen.getByRole("button", { name: "移除 1 条" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.remove).toHaveBeenCalledWith({ filterId: 1, ids: [1], blockBackfill: false });
    expect(screen.getByText("已从“分组一”移除 1 条消息").closest('[role="status"]')).toBeTruthy();
  });

  it("keeps failed batch selections available and locks completion until the request finishes", async () => {
    let reject!: (error: Error) => void;
    mocks.remove.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "选择" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择当前已加载的消息" }));
    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    fireEvent.click(screen.getByRole("button", { name: "移除 1 条" }));
    expect((screen.getByRole("button", { name: "标记完成", hidden: true }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject(new Error("网络断开")));
    expect(screen.getByRole("alert").textContent).toContain("网络断开");
    expect(screen.getByTestId("selected-messages").textContent).toBe("1");
    mocks.remove.mockResolvedValue({ success: true, removedIds: [1], count: 1 });
    fireEvent.click(screen.getByRole("button", { name: "移除 1 条" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByTestId("selected-messages").textContent).toBe("");
  });

  it("scopes a locate request to the current query and clears it when consumed", () => {
    mount();
    fireEvent.click(screen.getByRole("button", {name: "定位待完成"}));
    expect(screen.getByTestId("locate-request").textContent).not.toBe("0");
    fireEvent.click(screen.getByRole("button", {name: "确认定位完成"}));
    expect(screen.getByTestId("locate-request").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", {name: "进入分组二"}));
    expect(screen.getByTestId("locate-request").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", {name: "切换消息时间顺序"}));
    expect(screen.getByTestId("locate-request").textContent).toBe("0");
  });

  it("does not clear the next group's selection when an earlier batch finishes", async () => {
    let resolve!: () => void;
    mocks.apply.mockImplementation(() => new Promise<void>(done => {resolve = done;}));
    mount();
    fireEvent.click(screen.getByRole("button", {name: "选择"}));
    fireEvent.click(screen.getByRole("button", {name: "选择消息 1"}));
    fireEvent.click(screen.getByRole("button", {name: "标记完成"}));
    expect(mocks.apply).toHaveBeenCalledWith([1], true);
    fireEvent.click(screen.getByRole("button", {name: "进入分组二"}));
    fireEvent.click(screen.getByRole("button", {name: "选择"}));
    fireEvent.click(screen.getByRole("button", {name: "选择消息 2"}));
    const focusBefore = document.activeElement;
    await act(async () => resolve());
    expect(screen.getByTestId("selected-messages").textContent).toBe("2");
    expect(screen.getByRole("button", {name: "选择消息 2"})).toBeTruthy();
    expect(document.activeElement).toBe(focusBefore);
  });

  it("debounces the current group's query and restores its search after switching groups", async () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox", {name: "搜索当前消息组"}), {target: {value: "第09集"}});
    await waitFor(() => expect(mocks.useMessages.mock.lastCall?.[0]).toMatchObject({filterId: 1, search: "第09集"}));
    fireEvent.click(screen.getByRole("button", {name: "进入分组二"}));
    expect(mocks.useMessages.mock.lastCall?.[0]).toMatchObject({filterId: 2, search: undefined});
    fireEvent.click(screen.getByRole("button", {name: "进入分组一"}));
    expect(mocks.useMessages.mock.lastCall?.[0]).toMatchObject({filterId: 1, search: "第09集"});
    expect((screen.getByRole("searchbox", {name: "搜索当前消息组"}) as HTMLInputElement).value).toBe("第09集");
  });

  it("focuses the visible message region and search field after mobile navigation", async () => {
    vi.stubGlobal("matchMedia", () => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
    mount();
    fireEvent.click(screen.getByRole("button", {name: "进入分组二"}));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region", {name: "测试消息区域"})));
    fireEvent.click(screen.getByRole("button", {name: "搜索消息"}));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox", {name: "搜索当前消息组"})));
    fireEvent.keyDown(screen.getByRole("searchbox", {name: "搜索当前消息组"}), {key: "Escape"});
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", {name: "搜索消息"})));
  });
});
