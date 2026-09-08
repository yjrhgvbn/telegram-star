import { describe, expect, it } from "vitest";
import { getMessageContentPreview, MESSAGE_PREVIEW_CHARACTERS } from "./messageContentPreview";

describe("message preview boundaries", () => {
  it("preserves a full short message including whitespace", () => {
    const content = "  #标签\n\n【番名】: 04.mp4\n";
    expect(getMessageContentPreview(content)).toEqual({text: content, truncated: false});
  });
  it("moves the cut before a Telegram entity rather than changing its destination", () => {
    const content = "前".repeat(MESSAGE_PREVIEW_CHARACTERS - 1) + "下载地址";
    const preview = getMessageContentPreview(content, [{offset: MESSAGE_PREVIEW_CHARACTERS - 1, length: 4, url: "https://example.com/full"}]);
    expect(preview.text).toBe("前".repeat(MESSAGE_PREVIEW_CHARACTERS - 1));
    expect(preview.truncated).toBe(true);
  });
  it("never exposes a shortened plain URL", () => {
    const prefix = "前".repeat(MESSAGE_PREVIEW_CHARACTERS - 10);
    expect(getMessageContentPreview(prefix + " https://example.com/complete/path").text).toBe(prefix + " ");
  });
  it("does not split a UTF-16 surrogate pair", () => {
    const prefix = "字".repeat(MESSAGE_PREVIEW_CHARACTERS - 1);
    expect(getMessageContentPreview(prefix + "🙂后续").text).toBe(prefix);
  });
  it("collapses messages with many explicit lines even below the character limit", () => {
    const content = "第一行\n".repeat(20);
    const result = getMessageContentPreview(content);
    expect(result.truncated).toBe(true);
    expect(content.startsWith(result.text)).toBe(true);
    expect(result.text.split("\n")).toHaveLength(8);
  });
});
