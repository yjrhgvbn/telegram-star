import { describe, expect, it } from "vitest";
import {
  InvalidMediaThumbParamsError,
  parseMediaThumbParams,
} from "./media.service.js";

describe("media service", () => {
  it("parses media thumbnail params", () => {
    expect(parseMediaThumbParams({ chatId: "-1001", messageId: "42" })).toEqual({
      chatId: "-1001",
      messageId: 42,
    });
  });

  it("rejects invalid thumbnail params", () => {
    expect(() => parseMediaThumbParams({ chatId: "", messageId: "42" })).toThrow(
      InvalidMediaThumbParamsError,
    );
    expect(() => parseMediaThumbParams({ chatId: "-1001", messageId: "0" })).toThrow(
      InvalidMediaThumbParamsError,
    );
    expect(() => parseMediaThumbParams({ chatId: "-1001", messageId: "abc" })).toThrow(
      InvalidMediaThumbParamsError,
    );
  });
});
