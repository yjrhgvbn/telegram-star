import { describe, expect, it } from "vitest";
import {
  getApiBaseUrl,
  getApiUrl,
  getMediaThumbUrl,
  getMessageEventsUrl,
} from "./url";

describe("api url builder", () => {
  it("uses relative /api in same-origin mode", () => {
    expect(getApiBaseUrl("")).toBe("/api");
    expect(getApiUrl("/messages", "")).toBe("/api/messages");
  });

  it("uses an absolute /api base for remote server roots", () => {
    expect(getApiBaseUrl("https://example.com")).toBe("https://example.com/api");
    expect(getApiUrl("/messages", "https://example.com")).toBe("https://example.com/api/messages");
  });

  it("normalizes trailing slash and /api suffix from remote input", () => {
    expect(getApiBaseUrl("https://example.com/")).toBe("https://example.com/api");
    expect(getApiBaseUrl("https://example.com/api/")).toBe("https://example.com/api");
    expect(getApiUrl("messages", "https://example.com/app/api/")).toBe(
      "https://example.com/app/api/messages",
    );
  });

  it("builds SSE and media urls from the same api base", () => {
    expect(getMessageEventsUrl("")).toBe("/api/messages/events");
    expect(getMessageEventsUrl("https://example.com/api")).toBe(
      "https://example.com/api/messages/events",
    );
    expect(getMediaThumbUrl(1, 2, "https://example.com/api")).toBe(
      "https://example.com/api/media/1/2/thumb",
    );
  });
});
