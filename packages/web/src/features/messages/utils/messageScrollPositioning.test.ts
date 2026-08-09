import { describe, expect, it } from "vitest";
import { getInitialMessageScrollTarget } from "./messageScrollPositioning";

const messages = [
  { id: 1, height: 120 },
  { id: 2, height: 150 },
  { id: 3, height: 180 },
];

describe("messageScrollPositioning", () => {
  it("scrolls to the anchor message when one is available", () => {
    expect(getInitialMessageScrollTarget(messages, 2)).toEqual({
      index: 1,
      align: "center",
    });
  });

  it("falls back to the newest message when anchor is missing", () => {
    expect(getInitialMessageScrollTarget(messages, 42)).toEqual({
      index: 2,
      align: "end",
    });
  });

  it("targets the newest message when automatic locating is disabled", () => {
    expect(getInitialMessageScrollTarget(messages, null)).toEqual({
      index: 2,
      align: "end",
    });
  });

  it("does not produce an initial target for an empty list", () => {
    expect(getInitialMessageScrollTarget([], null)).toBeNull();
  });
});
