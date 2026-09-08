// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { saveServerUrl } from "@/shared/runtime/serverConfig";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { Message } from "@/types";
import { useMessageCompletion } from "./useMessageCompletion";

const message = (id: number, isRead: boolean) => ({ id, isRead, mediaType: "video" }) as Message;
const wrapper = () => createQueryWrapper(createTestQueryClient());

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("useMessageCompletion", () => {
  it("completes one message idempotently and locks repeated clicks while pending", async () => {
    let resolve!: (value: { success: true; count: number }) => void;
    const batch = vi.spyOn(api.messages, "batchRead").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const toggleRead = vi.fn();
    const markAsReadLocal = vi.fn();
    const { result } = renderHook(() => useMessageCompletion({
      scope: "8", messages: [message(1, false)], toggleRead, markAsReadLocal,
    }), { wrapper: wrapper() });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.apply([1], true);
      void result.current.apply([1], true);
    });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith([1]);
    expect(result.current.pendingIds.has(1)).toBe(true);
    await act(async () => { resolve({ success: true, count: 1 }); await pending; });
    expect(toggleRead).not.toHaveBeenCalled();
    expect(markAsReadLocal).toHaveBeenCalledWith([1]);
    expect(result.current.error).toBeNull();
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("reports accurate partial restoration counts and retries only the remaining messages", async () => {
    const toggleRead = vi.fn(async (id: number) => { if (id === 2) throw new Error("offline"); });
    const markAsReadLocal = vi.fn();
    const batch = vi.spyOn(api.messages, "batchRead");
    const { result, rerender } = renderHook(({ messages }) => useMessageCompletion({
      scope: "8", messages, toggleRead, markAsReadLocal,
    }), { initialProps: { messages: [message(1, true), message(2, true), message(3, true)] }, wrapper: wrapper() });
    await act(async () => { await result.current.apply([1, 2, 3], false); });
    expect(result.current.error).toBe("已处理 2 条；1 条保存失败，请重试");
    rerender({ messages: [message(1, false), message(2, true), message(3, false)] });
    toggleRead.mockResolvedValue();
    await act(async () => { await result.current.apply([1, 2, 3], false); });
    expect(batch).not.toHaveBeenCalled();
    expect(markAsReadLocal).not.toHaveBeenCalled();
    expect(toggleRead.mock.calls).toEqual([[1], [2], [3], [2]]);
    expect(result.current.error).toBeNull();
  });

  it("clears failures explicitly and at the beginning of a new operation", async () => {
    const batch = vi.spyOn(api.messages, "batchRead").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useMessageCompletion({
      scope: "8", messages: [message(1, false), message(2, false)], toggleRead: vi.fn(), markAsReadLocal: vi.fn(),
    }), { wrapper: wrapper() });
    await act(async () => { await result.current.apply([1, 2], true); });
    expect(result.current.error).toBe("2 条保存失败，请重试");
    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.apply([1], true); });
    expect(result.current.error).toBe("1 条保存失败，请重试");
    let resolve!: (value: {success: true; count: number}) => void;
    batch.mockImplementation(() => new Promise(done => {resolve = done;}));
    let pending!: Promise<void>;
    act(() => { pending = result.current.apply([1], true); });
    expect(result.current.error).toBeNull();
    expect(result.current.pendingIds.has(1)).toBe(true);
    await act(async () => {resolve({success: true, count: 1}); await pending;});
    expect(result.current.error).toBeNull();
  });

  it("clears an old scope's error and ignores its late failure", async () => {
    const batch = vi.spyOn(api.messages, "batchRead").mockRejectedValue(new Error("offline"));
    const {result, rerender} = renderHook(({scope}) => useMessageCompletion({
      scope, messages: [message(1, false)], toggleRead: vi.fn(), markAsReadLocal: vi.fn(),
    }), {initialProps: {scope: "8"}, wrapper: wrapper()});
    await act(async () => {await result.current.apply([1], true);});
    expect(result.current.error).not.toBeNull();
    rerender({scope: "9"});
    expect(result.current.error).toBeNull();
    let reject!: (error: Error) => void;
    batch.mockImplementation(() => new Promise((_resolve, fail) => {reject = fail;}));
    let pending!: Promise<void>;
    act(() => {pending = result.current.apply([1], true);});
    rerender({scope: "10"});
    await act(async () => {reject(new Error("late failure")); await pending;});
    expect(result.current.error).toBeNull();
  });

  it.each(["unmount", "server"] as const)("stops remaining restoration requests after %s", async (reason) => {
    let resolve!: () => void;
    const toggleRead = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const { result, unmount } = renderHook(() => useMessageCompletion({
      scope: "8", messages: [message(1, true), message(2, true)], toggleRead, markAsReadLocal: vi.fn(),
    }), { wrapper: wrapper() });
    let pending!: Promise<void>;
    act(() => { pending = result.current.apply([1, 2], false); });
    if (reason === "unmount") unmount();
    else saveServerUrl("https://another.example");
    await act(async () => { resolve(); await pending; });
    expect(toggleRead).toHaveBeenCalledTimes(1);
    expect(toggleRead).toHaveBeenCalledWith(1);
  });

  it("does not apply a completed batch response after switching servers", async () => {
    let resolve!: (value: { success: true; count: number }) => void;
    vi.spyOn(api.messages, "batchRead").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const markAsReadLocal = vi.fn();
    const { result } = renderHook(() => useMessageCompletion({
      scope: "8", messages: [message(1, false)], toggleRead: vi.fn(), markAsReadLocal,
    }), { wrapper: wrapper() });
    let pending!: Promise<void>;
    act(() => { pending = result.current.apply([1], true); });
    saveServerUrl("https://another.example");
    await act(async () => { resolve({ success: true, count: 1 }); await pending; });
    expect(markAsReadLocal).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
});
