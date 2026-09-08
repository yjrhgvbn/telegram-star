// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageViewState } from "./useMessageViewState";

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useMessageViewState", () => {
  it("restores each group's controls and position without rerendering on scroll", () => {
    let renders = 0;
    const { result, rerender } = renderHook(({ group }) => {
      renders += 1;
      return useMessageViewState(group, "/api");
    }, { initialProps: { group: "8" } });
    act(() => {
      result.current.setReadFilter("unread");
      result.current.setSearchQuery("episode");
      result.current.setSearchOpen(true);
      result.current.setOrder("desc");
    });
    const previousRenders = renders;
    act(() => result.current.rememberPosition({ messageId: 42, offset: 35 }));
    expect(renders).toBe(previousRenders);
    expect(result.current.restorePosition).toBeNull();

    rerender({ group: "9" });
    expect(result.current).toMatchObject({ readFilter: "all", searchQuery: "", order: "asc" });
    rerender({ group: "8" });
    expect(result.current).toMatchObject({
      readFilter: "unread", searchQuery: "episode", searchOpen: true, order: "desc",
      restorePosition: { messageId: 42, offset: 35 },
    });
    act(() => result.current.clearPosition());
    expect(result.current.restorePosition).toBeNull();
  });

  it("isolates servers, persists across remounts and clears anchors for changed searches", () => {
    const { result, unmount } = renderHook(() => useMessageViewState("all", "https://one/api"));
    act(() => result.current.setSearchQuery("caption"));
    act(() => result.current.rememberPosition({ messageId: 7, offset: -10 }));
    unmount();
    const restored = renderHook(({ server }) => useMessageViewState("all", server), {
      initialProps: { server: "https://one/api" },
    });
    expect(restored.result.current.restorePosition).toEqual({ messageId: 7, offset: -10 });
    restored.rerender({ server: "https://two/api" });
    expect(restored.result.current.searchQuery).toBe("");
    expect(restored.result.current.restorePosition).toBeNull();
    restored.rerender({ server: "https://one/api" });
    act(() => restored.result.current.setSearchQuery("another"));
    expect(restored.result.current.restorePosition).toBeNull();
  });

  it("keeps navigation working when storage is unavailable or malformed", () => {
    sessionStorage.setItem("telegram-star:message-views:v1", "not json");
    const { result } = renderHook(() => useMessageViewState("8"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    act(() => result.current.setOrder("desc"));
    expect(result.current.order).toBe("desc");
    act(() => result.current.rememberPosition({ messageId: -1, offset: NaN }));
    expect(result.current.restorePosition).toBeNull();
  });

  it("ignores the previous list's final measurement after changing its search", () => {
    const { result, rerender } = renderHook(({ group }) => useMessageViewState(group), {
      initialProps: { group: "8" },
    });
    const rememberOldList = result.current.rememberPosition;
    act(() => result.current.setSearchQuery("new search"));
    act(() => rememberOldList({ messageId: 42, offset: 10 }));
    rerender({ group: "9" });
    rerender({ group: "8" });
    expect(result.current.restorePosition).toBeNull();
  });

  it("restores all-messages after the mobile picker hides and reopens the same group", () => {
    const { result, rerender } = renderHook(({ active }) => useMessageViewState("all", "/api", active), {
      initialProps: { active: true },
    });
    act(() => result.current.rememberPosition({ messageId: 17, offset: 80 }));
    expect(result.current.restorePosition).toBeNull();
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current.restorePosition).toEqual({ messageId: 17, offset: 80 });
  });
});
