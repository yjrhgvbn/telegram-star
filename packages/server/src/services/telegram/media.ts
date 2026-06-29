/**
 * 媒体信息提取工具。
 * 从 GramJS message 对象中提取媒体元数据（类型、文件名、大小等）和缩略图。
 * 不进行文件下载，仅提取已随消息返回的内联元数据。
 */
import { extractDocumentMediaInfo } from "./media/documentMediaInfo.js";
import {
  extractPhotoSize,
  extractPhotoThumbBase64,
} from "./media/thumbnails.js";
import type { MediaInfo } from "./media/types.js";

export type { MediaInfo, MediaType } from "./media/types.js";
export { getMessageTextContent, hasMessageContent } from "./media/messageContent.js";

/**
 * 从 GramJS message 对象中提取媒体元信息。
 * 不执行任何网络下载，仅解析消息中已有的内联数据。
 *
 * @returns MediaInfo 或 null（无媒体）
 */
export function extractMediaInfo(message: any): MediaInfo | null {
  const media = message?.media;
  if (!media) return null;

  const className = media.className as string;

  switch (className) {
    case "MessageMediaPhoto": {
      const photo = media.photo;
      const size = extractPhotoSize(photo);
      return {
        mediaType: "photo",
        mediaFileName: null,
        mediaFileSize: null,
        mediaMimeType: "image/jpeg",
        mediaDuration: null,
        mediaThumbBase64: extractPhotoThumbBase64(photo),
        mediaExtra: size ? JSON.stringify({ w: size.w, h: size.h }) : null,
      };
    }

    case "MessageMediaDocument": {
      return extractDocumentMediaInfo(media);
    }

    case "MessageMediaContact": {
      return {
        mediaType: "contact",
        mediaFileName: null,
        mediaFileSize: null,
        mediaMimeType: null,
        mediaDuration: null,
        mediaThumbBase64: null,
        mediaExtra: JSON.stringify({
          firstName: media.firstName ?? "",
          lastName: media.lastName ?? "",
          phoneNumber: media.phoneNumber ?? "",
        }),
      };
    }

    case "MessageMediaGeo":
    case "MessageMediaGeoLive": {
      const geo = media.geo;
      return {
        mediaType: "geo",
        mediaFileName: null,
        mediaFileSize: null,
        mediaMimeType: null,
        mediaDuration: null,
        mediaThumbBase64: null,
        mediaExtra: geo
          ? JSON.stringify({ lat: geo.lat, long: geo.long })
          : null,
      };
    }

    case "MessageMediaPoll": {
      const question =
        media.poll?.question?.text ??
        media.poll?.question ??
        null;
      return {
        mediaType: "poll",
        mediaFileName: null,
        mediaFileSize: null,
        mediaMimeType: null,
        mediaDuration: null,
        mediaThumbBase64: null,
        mediaExtra: question
          ? JSON.stringify({ question: String(question) })
          : null,
      };
    }

    case "MessageMediaEmpty":
    case "MessageMediaUnsupported":
      return null;

    default:
      // WebPage、Invoice、Dice 等暂不单独处理，返回 null
      return null;
  }
}
