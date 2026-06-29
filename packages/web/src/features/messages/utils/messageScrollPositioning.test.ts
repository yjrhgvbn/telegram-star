import { describe, expect, it } from "vitest";
import {
  getInitialMessageScrollTarget,
  getPrependCompensationHeight,
} from "./messageScrollPositioning";

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

  it("does not produce an initial target for an empty list", () => {
    expect(getInitialMessageScrollTarget([], null)).toBeNull();
  });

  it("sums only prepended message heights before the previous first message", () => {
    const nextMessages = [
      { id: 10, height: 90 },
      { id: 11, height: 110 },
      ...messages,
    ];

    expect(
      getPrependCompensationHeight(nextMessages, 1, (message) => message.height),
    ).toBe(200);
  });

  it("skips compensation when the previous first message is unchanged", () => {
    expect(
      getPrependCompensationHeight(messages, 1, (message) => message.height),
    ).toBe(0);
  });
});
