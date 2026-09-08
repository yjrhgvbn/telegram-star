// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Message } from "@/types";

const mocks = vi.hoisted(() => ({
  virtualize: vi.fn(), edges: vi.fn(), positioning: vi.fn(),
  virtualizer: {
    measure: vi.fn(), getVirtualItems: vi.fn(() => []), getVirtualItemForOffset: vi.fn(() => ({index: 0})),
    scrollToEnd: vi.fn(), scrollToIndex: vi.fn(), scrollToOffset: vi.fn(), getOffsetForIndex: vi.fn(),
    containerRef: vi.fn(), measureElement: vi.fn(),
  },
}));
vi.mock("@tanstack/react-virtual", () => ({useVirtualizer: mocks.virtualize}));
vi.mock("../hooks/useMessageScrollEdges", () => ({useMessageScrollEdges: mocks.edges}));
vi.mock("../hooks/useMessageScrollPositioning", () => ({useMessageScrollPositioning: mocks.positioning}));
vi.mock("../hooks/useReadSyncOnVisibility", () => ({useReadSyncOnVisibility: vi.fn()}));
import { MessageList } from "./MessageList";

const message = (id: number, isRead = false) => ({id, isRead, content: `消息 ${id}`}) as Message;
function props(patch: Partial<ComponentProps<typeof MessageList>> = {}): ComponentProps<typeof MessageList> {
  return {
    messages: [message(1), message(2), message(3)], hasOlder: true, hasNewer: false,
    loading: false, loadingOlder: false, loadingNewer: false, anchorId: null, hasPendingNew: false,
    onLoadOlder: vi.fn(), onLoadNewer: vi.fn(), onFlushPending: vi.fn(), onSetAtBottom: vi.fn(),
    onToggleRead: vi.fn(), onOpenTelegram: vi.fn(), markAsReadLocal: vi.fn(), ...patch,
  };
}
function mockRowRects(rows: { start: number; size: number }[]) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.index;
    const row = index === undefined ? undefined : rows[Number(index)];
    const scrollTop = this.closest("[data-message-scroll]")?.scrollTop ?? 0;
    return new DOMRect(0, 20 + (row ? row.start - scrollTop : 0), 900, row?.size ?? 600);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.virtualize.mockReturnValue(mocks.virtualizer);
  mocks.positioning.mockReturnValue({current: true});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("MessageList integration", () => {
  it("reverses rendering and pagination edges together without mutating the chronological data", () => {
    const original = [message(1), message(2), message(3)];
    const options = props({messages: original, order: "desc", loadingOlder: true});
    render(<MessageList {...options} />);
    const positioned = mocks.positioning.mock.lastCall?.[0];
    expect(positioned.messages.map((item: Message) => item.id)).toEqual([3, 2, 1]);
    expect(original.map(item => item.id)).toEqual([1, 2, 3]);
    const edges = mocks.edges.mock.lastCall?.[0];
    expect(edges).toMatchObject({hasOlder: false, hasNewer: true, loadingOlder: false, loadingNewer: true});
    edges.onLoadNewer();
    expect(options.onLoadOlder).toHaveBeenCalledOnce();
    edges.onSetAtBottom(true);
    expect(options.onSetAtBottom).toHaveBeenLastCalledWith(false);
  });

  it("consumes a locate request after loading, including when no pending message exists", () => {
    const options = props({messages: [], loading: true, locateRequest: 9, onLocateHandled: vi.fn()});
    const {rerender} = render(<MessageList {...options} />);
    expect(options.onLocateHandled).not.toHaveBeenCalled();
    rerender(<MessageList {...options} loading={false} messages={[message(1, true)]} />);
    expect(options.onLocateHandled).toHaveBeenCalledOnce();
    expect(mocks.virtualizer.scrollToIndex).not.toHaveBeenCalled();
    rerender(<MessageList {...options} loading={false} messages={[message(1, true), message(2)]} />);
    expect(options.onLocateHandled).toHaveBeenCalledOnce();
    expect(mocks.virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it("jumps for an arrival once and does not replay that jump on later completion changes", () => {
    const options = props({hasPendingNew: true});
    const {rerender} = render(<MessageList {...options} />);
    fireEvent.click(screen.getByRole("button", {name: "有新消息"}));
    expect(options.onFlushPending).toHaveBeenCalledOnce();
    expect(mocks.virtualizer.scrollToEnd).toHaveBeenCalledOnce();
    rerender(<MessageList {...options} hasPendingNew={false} />);
    // A subsequent read-state update can happen after the user scrolls away.
    rerender(<MessageList {...options} hasPendingNew={false} messages={[message(1, true), message(2), message(3)]} />);
    expect(mocks.virtualizer.scrollToEnd).toHaveBeenCalledOnce();
  });

  it("remeasures mounted rows at the new width before the final indexed landing", async () => {
    let width = 900;
    vi.spyOn(window, "innerWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const rows = [0, 1, 2].map(index => ({key: index + 1, index, start: 36 + index * 200, end: 236 + index * 200, size: 200, lane: 0}));
    mockRowRects(rows);
    mocks.virtualizer.getVirtualItems.mockReturnValue(rows as never[]);
    const remember = vi.fn();
    render(<MessageList {...props({onRememberPosition: remember})} />);
    const scroll = screen.getByLabelText("当前消息组的消息");
    scroll.scrollTop = 250;
    fireEvent.scroll(scroll);
    await waitFor(() => expect(remember).toHaveBeenCalledWith({messageId: 2, offset: 14}));

    const events: string[] = [];
    mocks.virtualizer.measure.mockImplementation(() => {events.push("invalidate");});
    mocks.virtualizer.measureElement.mockImplementation((element: HTMLElement | null) => {
      if (!element) return;
      events.push(`measure-${element.dataset.messageId}`);
      // The preceding row gets taller after the mobile layout stacks its media.
      if (element.dataset.messageId === "1") rows[1].start = 386;
    });
    mocks.virtualizer.scrollToIndex.mockImplementation((index: number) => {
      events.push(`land-${index}-${rows[index].start}`);
      scroll.scrollTop = rows[index].start;
    });
    width = 390;
    fireEvent(window, new Event("resize"));
    expect(events).toEqual(["invalidate", "land-1-236", "measure-1", "measure-2", "measure-3", "land-1-386"]);
    expect(scroll.scrollTop).toBe(386);
    expect(mocks.virtualizer.scrollToIndex).toHaveBeenLastCalledWith(1, {align: "start"});
    mocks.virtualizer.getVirtualItems.mockReturnValue([]);
    mocks.virtualizer.measure.mockReset();
    mocks.virtualizer.measureElement.mockReset();
    mocks.virtualizer.scrollToIndex.mockReset();
  });

  it("preserves the restored row offset when a mobile scrollbar narrows the content", async () => {
    let width = 390;
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const rows = [0, 1, 2].map(index => ({key: index + 1, index, start: 36 + index * 200, end: 236 + index * 200, size: 200, lane: 0}));
    mocks.virtualizer.getVirtualItems.mockReturnValue(rows as never[]);
    mockRowRects(rows);
    const remember = vi.fn();
    render(<MessageList {...props({ onRememberPosition: remember })} />);
    const scroll = screen.getByLabelText("当前消息组的消息");
    scroll.scrollTop = 276;
    fireEvent.scroll(scroll);
    await waitFor(() => expect(remember).toHaveBeenCalledWith({ messageId: 2, offset: 40 }));
    mocks.virtualizer.scrollToIndex.mockImplementation(index => { scroll.scrollTop = rows[index].start; });
    mocks.virtualizer.scrollToOffset.mockImplementation(offset => { scroll.scrollTop = offset; });
    width = 384;
    fireEvent(window, new Event("resize"));
    expect(scroll.scrollTop - rows[1].start).toBe(40);
    mocks.virtualizer.scrollToIndex.mockReset();
    mocks.virtualizer.scrollToOffset.mockReset();
    mocks.virtualizer.getVirtualItems.mockReturnValue([]);
  });

  it("keeps measured row sizes when entering a group after fonts have loaded", async () => {
    const original = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { status: "loaded", ready: Promise.resolve() } });
    try {
      render(<MessageList {...props()} />);
      await act(async () => {});
      expect(mocks.virtualizer.measure).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(document, "fonts", original);
      else Reflect.deleteProperty(document, "fonts");
    }
  });

  it("saves the painted position before a same-frame group switch detaches the list", () => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const rows = [0, 1, 2].map(index => ({key: index + 1, index, start: 36 + index * 200, end: 236 + index * 200, size: 200, lane: 0}));
    mocks.virtualizer.getVirtualItems.mockReturnValue(rows as never[]);
    // Actual row transforms have advanced ahead of the cached virtual positions.
    mockRowRects(rows.map(row => ({ ...row, start: row.start + 18 })));
    const remember = vi.fn();
    const view = render(<MessageList {...props({ onRememberPosition: remember })} />);
    const scroll = screen.getByLabelText("当前消息组的消息");
    scroll.scrollTop = 281;
    fireEvent.scroll(scroll);
    view.unmount();
    expect(remember).toHaveBeenLastCalledWith({ messageId: 2, offset: 27 });
    mocks.virtualizer.getVirtualItems.mockReturnValue([]);
  });
});
