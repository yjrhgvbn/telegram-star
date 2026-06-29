import { describe, expect, it } from "vitest";
import { getMessageScrollEdgeState } from "./useMessageScrollEdges";

describe("getMessageScrollEdgeState", () => {
  it("detects when the scroll position is near the top", () => {
    expect(
      getMessageScrollEdgeState({
        scrollTop: 120,
        scrollHeight: 2000,
        clientHeight: 600,
      }),
    ).toEqual({
      nearTop: true,
      nearBottom: false,
      atBottom: false,
    });
  });

  it("distinguishes near-bottom loading from exact at-bottom state", () => {
    expect(
      getMessageScrollEdgeState({
        scrollTop: 1150,
        scrollHeight: 2000,
        clientHeight: 600,
      }),
    ).toEqual({
      nearTop: false,
      nearBottom: true,
      atBottom: false,
    });
  });

  it("detects the at-bottom threshold separately", () => {
    expect(
      getMessageScrollEdgeState({
        scrollTop: 1360,
        scrollHeight: 2000,
        clientHeight: 600,
      }),
    ).toEqual({
      nearTop: false,
      nearBottom: true,
      atBottom: true,
    });
  });
});
