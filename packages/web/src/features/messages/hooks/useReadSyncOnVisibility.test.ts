import { describe, expect, it } from "vitest";
import {
  getNearbyUnreadMessageIds,
  type ReadSyncMessage,
} from "./useReadSyncOnVisibility";

function createMessages(): ReadSyncMessage[] {
  return [
    { id: 1, isRead: false },
    { id: 2, isRead: true },
    { id: 3, isRead: false },
    { id: 4, isRead: false },
    { id: 5, isRead: true },
  ];
}

describe("getNearbyUnreadMessageIds", () => {
  it("returns unread messages around the Telegram jump target", () => {
    expect(getNearbyUnreadMessageIds(createMessages(), 3, 1)).toEqual([3, 4]);
  });

  it("clamps the neighbor window to message boundaries", () => {
    expect(getNearbyUnreadMessageIds(createMessages(), 1, 3)).toEqual([1, 3, 4]);
  });

  it("returns an empty list when the jump target is not in the current window", () => {
    expect(getNearbyUnreadMessageIds(createMessages(), 999, 5)).toEqual([]);
  });
});
