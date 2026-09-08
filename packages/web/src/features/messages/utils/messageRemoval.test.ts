import { describe, expect, it } from "vitest";
import type { Message } from "@/types";
import { getMessageFilterMatches, removeMessageRule } from "./messageRemoval";

const sharedMessage = {
  id: 1, matchedFilterId: 1, filterName: "A", matchedKeyword: "a", isRead: true,
  filterMatches: [{ filterId: 1, filterName: "A", matchedKeyword: "a" }, { filterId: 2, filterName: "B", matchedKeyword: "b" }],
} as Message;

describe("rule-scoped message removal", () => {
  it("removes only A while keeping B and all-message projection", () => {
    expect(removeMessageRule([sharedMessage], 1, new Set([1]), 1)).toEqual([]);
    for (const filterId of [undefined, 2]) {
      expect(removeMessageRule([sharedMessage], 1, new Set([1]), filterId)).toEqual([
        expect.objectContaining({ id: 1, matchedFilterId: 2, filterName: "B", matchedKeyword: "b", isRead: true, filterMatches: [sharedMessage.filterMatches![1]] }),
      ]);
    }
    expect(sharedMessage.filterMatches).toHaveLength(2);
  });
  it("falls back to the legacy match without inventing ownership for orphan messages", () => {
    expect(getMessageFilterMatches({ ...sharedMessage, filterMatches: undefined })).toHaveLength(1);
    expect(getMessageFilterMatches({ ...sharedMessage, filterMatches: [] })).toEqual([]);
    expect(getMessageFilterMatches({ ...sharedMessage, filterMatches: undefined, matchedFilterId: null })).toEqual([]);
    expect(removeMessageRule([{ ...sharedMessage, filterMatches: undefined }], 1, new Set([1]))).toEqual([]);
  });
});
