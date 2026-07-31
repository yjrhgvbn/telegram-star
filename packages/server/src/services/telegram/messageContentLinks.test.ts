import { describe, expect, it } from "vitest";
import {
  extractMessageContentLinks,
  parseMessageContentLinks,
  serializeMessageContentLinks,
} from "./messageContentLinks.js";

describe("message content links", () => {
  it("extracts hidden TextUrl links and visible URL entities in UTF-16 offsets", () => {
    const content = "下载：按我\n镜像：https://example.com/file";
    const hiddenOffset = content.indexOf("按我");
    const visibleOffset = content.indexOf("https://");

    expect(
      extractMessageContentLinks(
        {
          entities: [
            {
              className: "MessageEntityTextUrl",
              offset: hiddenOffset,
              length: 2,
              url: "https://download.example/file",
            },
            {
              className: "MessageEntityUrl",
              offset: visibleOffset,
              length: "https://example.com/file".length,
            },
          ],
        },
        content,
      ),
    ).toEqual([
      { offset: hiddenOffset, length: 2, url: "https://download.example/file" },
      {
        offset: visibleOffset,
        length: "https://example.com/file".length,
        url: "https://example.com/file",
      },
    ]);
  });

  it("rejects unsafe protocols and invalid ranges", () => {
    expect(
      extractMessageContentLinks(
        {
          entities: [
            { className: "MessageEntityTextUrl", offset: 0, length: 2, url: "javascript:alert(1)" },
            { className: "MessageEntityTextUrl", offset: 20, length: 2, url: "https://safe.test" },
          ],
        },
        "按我",
      ),
    ).toEqual([]);
  });

  it("round-trips stored JSON and treats corrupt data as empty", () => {
    const links = [{ offset: 1, length: 2, url: "tg://resolve?domain=test" }];
    expect(parseMessageContentLinks(serializeMessageContentLinks(links))).toEqual(links);
    expect(parseMessageContentLinks("broken")).toEqual([]);
  });
});
