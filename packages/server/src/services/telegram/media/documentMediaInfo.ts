import {
  findDocumentAttribute,
  getDocumentFileName,
  getDocumentMimeType,
  getDocumentSize,
} from "./documentAttributes.js";
import { extractDocumentThumbBase64 } from "./thumbnails.js";
import type { MediaInfo } from "./types.js";

export function extractDocumentMediaInfo(media: any): MediaInfo | null {
  const doc = media?.document;
  if (!doc) return null;

  const mime = getDocumentMimeType(doc);
  const fileSize = getDocumentSize(doc);
  const thumbBase64 = extractDocumentThumbBase64(doc);
  const fileName = getDocumentFileName(doc);

  const videoAttr = findDocumentAttribute(doc, "DocumentAttributeVideo");
  const audioAttr = findDocumentAttribute(doc, "DocumentAttributeAudio");
  const stickerAttr = findDocumentAttribute(doc, "DocumentAttributeSticker");
  const animatedAttr = findDocumentAttribute(doc, "DocumentAttributeAnimated");

  // Telegram document attributes can overlap; keep this priority stable.
  if (stickerAttr) {
    return {
      mediaType: "sticker",
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      mediaMimeType: mime,
      mediaDuration: null,
      mediaThumbBase64: thumbBase64,
      mediaExtra: stickerAttr.alt ? JSON.stringify({ emoji: stickerAttr.alt }) : null,
    };
  }

  if (animatedAttr || mime === "image/gif") {
    return {
      mediaType: "gif",
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      mediaMimeType: mime,
      mediaDuration: videoAttr ? Math.round(videoAttr.duration ?? 0) : null,
      mediaThumbBase64: thumbBase64,
      mediaExtra: videoAttr ? JSON.stringify({ w: videoAttr.w, h: videoAttr.h }) : null,
    };
  }

  if (videoAttr?.roundMessage) {
    return {
      mediaType: "videoNote",
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      mediaMimeType: mime,
      mediaDuration: Math.round(videoAttr.duration ?? 0),
      mediaThumbBase64: thumbBase64,
      mediaExtra: JSON.stringify({ w: videoAttr.w, h: videoAttr.h }),
    };
  }

  if (videoAttr || media.video) {
    return {
      mediaType: "video",
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      mediaMimeType: mime,
      mediaDuration: videoAttr ? Math.round(videoAttr.duration ?? 0) : null,
      mediaThumbBase64: thumbBase64,
      mediaExtra: videoAttr ? JSON.stringify({ w: videoAttr.w, h: videoAttr.h }) : null,
    };
  }

  if (audioAttr?.voice || media.voice) {
    return {
      mediaType: "voice",
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      mediaMimeType: mime,
      mediaDuration: audioAttr ? Math.round(audioAttr.duration ?? 0) : null,
      mediaThumbBase64: null,
      mediaExtra: null,
    };
  }

  if (audioAttr) {
    return {
      mediaType: "audio",
      mediaFileName: fileName,
      mediaFileSize: fileSize,
      mediaMimeType: mime,
      mediaDuration: Math.round(audioAttr.duration ?? 0),
      mediaThumbBase64: thumbBase64,
      mediaExtra: audioAttr.title || audioAttr.performer
        ? JSON.stringify({
            title: audioAttr.title ?? null,
            performer: audioAttr.performer ?? null,
          })
        : null,
    };
  }

  return {
    mediaType: "document",
    mediaFileName: fileName,
    mediaFileSize: fileSize,
    mediaMimeType: mime,
    mediaDuration: null,
    mediaThumbBase64: thumbBase64,
    mediaExtra: null,
  };
}
