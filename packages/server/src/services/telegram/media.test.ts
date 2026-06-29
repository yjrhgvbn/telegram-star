import { describe, expect, it } from "vitest";
import {
  extractMediaInfo,
  getMessageTextContent,
  hasMessageContent,
} from "./media.js";
import { rebuildStrippedJpeg } from "./media/strippedThumbnail.js";

const strippedBytes = Buffer.from([0, 12, 16, 0x01, 0x02, 0x03]);

describe("telegram media metadata", () => {
  it("rebuilds Telegram stripped thumbnails as JPEG buffers", () => {
    const rebuilt = rebuildStrippedJpeg(strippedBytes);

    expect(rebuilt.at(0)).toBe(0xff);
    expect(rebuilt.at(1)).toBe(0xd8);
    expect(rebuilt.at(-2)).toBe(0xff);
    expect(rebuilt.at(-1)).toBe(0xd9);
  });

  it("extracts photo metadata and largest known size", () => {
    const info = extractMediaInfo({
      media: {
        className: "MessageMediaPhoto",
        photo: {
          sizes: [
            { className: "PhotoStrippedSize", bytes: strippedBytes },
            { className: "PhotoSize", w: 320, h: 180 },
            { className: "PhotoSize", w: 1280, h: 720 },
          ],
        },
      },
    });

    expect(info).toMatchObject({
      mediaType: "photo",
      mediaMimeType: "image/jpeg",
      mediaExtra: JSON.stringify({ w: 1280, h: 720 }),
    });
    expect(info?.mediaThumbBase64?.startsWith("/9j/")).toBe(true);
  });

  it("classifies document media from Telegram document attributes", () => {
    const info = extractMediaInfo({
      media: {
        className: "MessageMediaDocument",
        document: {
          mimeType: "video/mp4",
          size: 123n,
          thumbs: [{ className: "PhotoStrippedSize", bytes: strippedBytes }],
          attributes: [
            { className: "DocumentAttributeFilename", fileName: "clip.mp4" },
            { className: "DocumentAttributeVideo", duration: 12.4, w: 640, h: 360 },
          ],
        },
      },
    });

    expect(info).toMatchObject({
      mediaType: "video",
      mediaFileName: "clip.mp4",
      mediaFileSize: 123,
      mediaMimeType: "video/mp4",
      mediaDuration: 12,
      mediaExtra: JSON.stringify({ w: 640, h: 360 }),
    });
    expect(info?.mediaThumbBase64?.startsWith("/9j/")).toBe(true);
  });

  it("extracts contact, geo and poll structured payloads", () => {
    expect(
      extractMediaInfo({
        media: {
          className: "MessageMediaContact",
          firstName: "Ada",
          lastName: "Lovelace",
          phoneNumber: "+1",
        },
      })?.mediaExtra,
    ).toBe(JSON.stringify({ firstName: "Ada", lastName: "Lovelace", phoneNumber: "+1" }));

    expect(
      extractMediaInfo({
        media: { className: "MessageMediaGeo", geo: { lat: 1.23, long: 4.56 } },
      })?.mediaExtra,
    ).toBe(JSON.stringify({ lat: 1.23, long: 4.56 }));

    expect(
      extractMediaInfo({
        media: { className: "MessageMediaPoll", poll: { question: { text: "Ship?" } } },
      })?.mediaExtra,
    ).toBe(JSON.stringify({ question: "Ship?" }));
  });

  it("handles text, captions and media-only messages as content", () => {
    expect(getMessageTextContent({ text: "hello", message: "caption" })).toBe("hello");
    expect(getMessageTextContent({ text: "  ", message: "caption" })).toBe("caption");
    expect(getMessageTextContent({})).toBe("");

    expect(hasMessageContent({ text: "hello" })).toBe(true);
    expect(hasMessageContent({ media: { className: "MessageMediaPhoto" } })).toBe(true);
    expect(hasMessageContent({ media: { className: "MessageMediaEmpty" } })).toBe(false);
  });
});
