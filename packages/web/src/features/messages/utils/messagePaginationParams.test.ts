import { describe, expect, it } from "vitest";
import {
  buildMessageListBaseParams,
  shouldAutoLocateMessages,
} from "./messagePaginationParams";

describe("messagePaginationParams", () => {
  it("builds the reusable message list params", () => {
    expect(buildMessageListBaseParams({
      limit: 30,
      isRead: false,
      filterId: 12,
      search: "keyword",
    })).toEqual({
      limit: 30,
      isRead: false,
      filterId: 12,
      search: "keyword",
    });
  });

  it("drops empty optional params before calling the API client", () => {
    expect(buildMessageListBaseParams({
      limit: 20,
      filterId: 0,
      search: "",
    })).toEqual({
      limit: 20,
      isRead: undefined,
      filterId: undefined,
      search: undefined,
    });
  });

  it("only enables auto locate for a concrete filter without read or search constraints", () => {
    expect(shouldAutoLocateMessages({
      limit: 20,
      filterId: 12,
      autoLocateEnabled: true,
    })).toBe(true);
    expect(shouldAutoLocateMessages({ limit: 20, autoLocateEnabled: true })).toBe(false);
    expect(shouldAutoLocateMessages({
      limit: 20,
      filterId: 12,
      autoLocateEnabled: true,
      isRead: false,
    })).toBe(false);
    expect(shouldAutoLocateMessages({
      limit: 20,
      filterId: 12,
      autoLocateEnabled: true,
      search: "night",
    })).toBe(false);
  });
});
