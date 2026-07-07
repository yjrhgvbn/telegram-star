import { describe, expect, it } from "vitest";
import {
  InvalidMediaThumbParamsError,
  MEDIA_THUMB_CACHE_CONTROL,
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

  it("uses private browser caching for thumbnail payloads", () => {
    expect(MEDIA_THUMB_CACHE_CONTROL).toBe("private, max-age=86400");
  });
});
