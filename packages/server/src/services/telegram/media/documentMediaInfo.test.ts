import { describe, expect, it } from "vitest";
import { extractDocumentMediaInfo } from "./documentMediaInfo.js";

function documentMedia(attributes: any[], extra: Record<string, unknown> = {}) {
  return {
    className: "MessageMediaDocument",
    document: {
      mimeType: "application/octet-stream",
      size: 100,
      attributes,
      ...extra,
    },
  };
}

describe("document media info", () => {
  it("classifies stickers before animated/video attributes", () => {
    const info = extractDocumentMediaInfo(
      documentMedia([
        { className: "DocumentAttributeAnimated" },
        { className: "DocumentAttributeSticker", alt: "*" },
      ]),
    );

    expect(info?.mediaType).toBe("sticker");
    expect(info?.mediaExtra).toBe(JSON.stringify({ emoji: "*" }));
  });

  it("classifies animated documents as gif", () => {
    const info = extractDocumentMediaInfo(
      documentMedia([
        { className: "DocumentAttributeVideo", duration: 3.4, w: 240, h: 160 },
        { className: "DocumentAttributeAnimated" },
      ]),
    );

    expect(info).toMatchObject({
      mediaType: "gif",
      mediaDuration: 3,
      mediaExtra: JSON.stringify({ w: 240, h: 160 }),
    });
  });

  it("classifies round video before normal video", () => {
    const info = extractDocumentMediaInfo(
      documentMedia([{ className: "DocumentAttributeVideo", roundMessage: true, duration: 5, w: 64, h: 64 }]),
    );

    expect(info).toMatchObject({
      mediaType: "videoNote",
      mediaDuration: 5,
      mediaExtra: JSON.stringify({ w: 64, h: 64 }),
    });
  });

  it("classifies voice before regular audio", () => {
    const info = extractDocumentMediaInfo(
      documentMedia([{ className: "DocumentAttributeAudio", voice: true, duration: 9 }]),
    );

    expect(info).toMatchObject({
      mediaType: "voice",
      mediaDuration: 9,
      mediaThumbBase64: null,
    });
  });

  it("falls back to generic document metadata", () => {
    const info = extractDocumentMediaInfo(
      documentMedia([{ className: "DocumentAttributeFilename", fileName: "report.pdf" }], {
        mimeType: "application/pdf",
      }),
    );

    expect(info).toMatchObject({
      mediaType: "document",
      mediaFileName: "report.pdf",
      mediaMimeType: "application/pdf",
      mediaFileSize: 100,
    });
  });
});
