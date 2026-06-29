import { describe, expect, it } from "vitest";
import { parseMessageEventData } from "./useMessageEvents";

describe("parseMessageEventData", () => {
  it("parses a new-message SSE payload", () => {
    expect(parseMessageEventData(JSON.stringify({ type: "new" }))).toEqual({ type: "new" });
  });

  it("parses a read-state SSE payload", () => {
    expect(parseMessageEventData(JSON.stringify({ type: "read", messageIds: [1, 2] }))).toEqual({
      type: "read",
      messageIds: [1, 2],
    });
  });

  it("keeps old string payloads as refresh events", () => {
    expect(parseMessageEventData("read")).toEqual({ type: "legacy-refresh" });
  });

  it("ignores malformed payloads", () => {
    expect(parseMessageEventData(JSON.stringify({ type: "read" }))).toBeNull();
  });
});
