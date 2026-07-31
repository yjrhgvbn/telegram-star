// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectRenderableLinks } from "./MessageContent";

describe("collectRenderableLinks", () => {
  it("prefers explicit Telegram links and rejects unsafe schemes", () => {
    const content = "按我 https://visible.example/path";
    const visibleOffset = content.indexOf("https://");

    expect(
      collectRenderableLinks(content, [
        { offset: 0, length: 2, url: "https://hidden.example/file" },
        { offset: visibleOffset, length: 5, url: "javascript:alert(1)" },
      ]),
    ).toEqual([
      { offset: 0, length: 2, url: "https://hidden.example/file" },
      {
        offset: visibleOffset,
        length: "https://visible.example/path".length,
        url: "https://visible.example/path",
      },
    ]);
  });
});
