// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types";
import { useMessageScrollPositioning } from "./useMessageScrollPositioning";

afterEach(cleanup);

const messages = [{ id: 1 }, { id: 2 }, { id: 3 }] as Message[];

function createVirtualizer() {
  return {
    scrollToIndex: vi.fn(),
    scrollToEnd: vi.fn(),
  };
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
});
