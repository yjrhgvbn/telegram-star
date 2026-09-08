// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Virtualizer } from "@tanstack/react-virtual";
import type { Message } from "@/types";
import { useMessageScrollPositioning } from "./useMessageScrollPositioning";

const scrollers: HTMLElement[] = [];
afterEach(() => { cleanup(); scrollers.splice(0).forEach(element => element.remove()); });

const messages = [{ id: 1 }, { id: 2 }, { id: 3 }] as Message[];

function createVirtualizer() {
  return {
    scrollToIndex: vi.fn(),
    scrollToEnd: vi.fn(),
    getVirtualItems: vi.fn(() => [{index: 1, start: 420}]),
    measureElement: vi.fn(),
    scrollToOffset: vi.fn(),
  };
}

function createScroller() {
  const scroller = document.createElement("div");
  Object.defineProperty(scroller, "clientHeight", {value: 200});
  Object.defineProperty(scroller, "scrollHeight", {value: 2000, configurable: true});
  document.body.appendChild(scroller);
  scrollers.push(scroller);
  return scroller;
}
function appendRows(scroller: HTMLElement) {
  [420, 300, 600].forEach((height, index) => {
    const row = document.createElement("div");
    row.dataset.messageId = String(messages[index].id);
    row.dataset.index = String(index);
    row.dataset.height = String(height);
    scroller.appendChild(row);
  });
}

describe("useMessageScrollPositioning", () => {
  it("centers the automatic-locate anchor before paint", () => {
    const virtualizer = createVirtualizer();

    renderHook(() =>
      useMessageScrollPositioning({
        messages,
        loading: false,
        anchorId: 2,
        virtualizer,
      }),
    );

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(1, { align: "center" });
    expect(virtualizer.scrollToEnd).not.toHaveBeenCalled();
  });

  it("uses the virtualizer's exact end position when there is no anchor", () => {
    const virtualizer = createVirtualizer();

    renderHook(() =>
      useMessageScrollPositioning({
        messages,
        loading: false,
        anchorId: null,
        virtualizer,
      }),
    );

    expect(virtualizer.scrollToEnd).toHaveBeenCalledOnce();
    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it("allows a fresh initial position after the query returns to loading", () => {
    const virtualizer = createVirtualizer();
    const { rerender } = renderHook(
      ({ loading }) =>
        useMessageScrollPositioning({
          messages,
          loading,
          anchorId: 2,
          virtualizer,
        }),
      { initialProps: { loading: false } },
    );

    rerender({ loading: true });
    rerender({ loading: false });

    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(2);
  });

  it("waits for the target commit and preserves fractional offsets across repeated real virtualizer mounts", () => {
    let savedOffset = 36.375;
    for (let visit = 0; visit < 5; visit++) {
      const scroller = createScroller();
      let reportOffset: ((offset: number, isScrolling: boolean) => void) | undefined;
      const virtualizer = new Virtualizer<HTMLDivElement, HTMLElement>({
        count: messages.length, getScrollElement: () => scroller,
        getItemKey: index => messages[index].id, estimateSize: () => 200,
        paddingStart: 36, overscan: 8,
        observeElementRect: (_instance, callback) => { callback({width: 900, height: 200}); return () => {}; },
        observeElementOffset: (_instance, callback) => { reportOffset = callback; callback(scroller.scrollTop, false); return () => {}; },
        scrollToFn: (offset, options) => { scroller.scrollTop = offset + (options.adjustments ?? 0); reportOffset?.(scroller.scrollTop, false); },
        measureElement: element => Number(element.dataset.height),
      });
      Object.defineProperty(scroller, "scrollHeight", {get: () => virtualizer.getTotalSize(), configurable: true});
      const dispose = virtualizer._didMount();
      virtualizer._willUpdate();
      const {result, rerender, unmount} = renderHook(() => useMessageScrollPositioning({
        messages, loading: false, anchorId: 2, virtualizer, scrollRef: {current: scroller},
        restorePosition: {messageId: 2, offset: savedOffset},
      }));
      expect(result.current.current).toBe(false);
      expect(scroller.scrollTop).toBe(236);
      appendRows(scroller);
      rerender();
      expect(result.current.current).toBe(true);
      const actualStart = virtualizer.getVirtualItems().find(item => item.index === 1)!.start;
      expect(actualStart).toBe(456);
      savedOffset = scroller.scrollTop - actualStart;
      expect(savedOffset).toBe(36.375);
      unmount(); dispose();
    }
  });

  it("adds the saved delta to the raw row start before clamping at the scroll boundary", () => {
    const scroller = createScroller();
    appendRows(scroller);
    Object.defineProperty(scroller, "scrollHeight", {value: 1000});
    const virtualizer = createVirtualizer();
    virtualizer.getVirtualItems.mockReturnValue([{index: 1, start: 900}]);
    virtualizer.scrollToOffset.mockImplementation(offset => { scroller.scrollTop = offset; });
    const {result} = renderHook(() => useMessageScrollPositioning({
      messages, loading: false, anchorId: 2, virtualizer, scrollRef: {current: scroller},
      restorePosition: {messageId: 2, offset: -100},
    }));
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(800, {align: "start"});
    expect(result.current.current).toBe(true);
  });

  it("does not enable saving before the native scroller reaches the measured target", () => {
    const scroller = createScroller();
    appendRows(scroller);
    const virtualizer = createVirtualizer();
    const {result, rerender} = renderHook(() => useMessageScrollPositioning({
      messages, loading: false, anchorId: 2, virtualizer, scrollRef: {current: scroller},
      restorePosition: {messageId: 2, offset: 36},
    }));
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(456, {align: "start"});
    expect(result.current.current).toBe(false);
    scroller.scrollTop = 456;
    rerender();
    expect(result.current.current).toBe(true);
    expect(virtualizer.scrollToIndex).toHaveBeenCalledOnce();
    expect(virtualizer.scrollToOffset).toHaveBeenCalledOnce();
  });

  it("starts at the newest row when the displayed order is descending", () => {
    const virtualizer = createVirtualizer();
    renderHook(() => useMessageScrollPositioning({
      messages: [...messages].reverse(), loading: false, anchorId: null,
      virtualizer, order: "desc",
    }));
    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(0, { align: "start" });
    expect(virtualizer.scrollToEnd).not.toHaveBeenCalled();
  });
});
