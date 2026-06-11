/**
 * 媒体信息提取工具。
 * 从 GramJS message 对象中提取媒体元数据（类型、文件名、大小等）和缩略图。
 * 不进行文件下载，仅提取已随消息返回的内联元数据。
 */

// --- Stripped JPEG 重建 ---

/**
 * Telegram 的 PhotoStrippedSize 使用自定义压缩格式：
 * 省略了标准 JPEG header/footer，仅保留扫描数据。
 * 此函数将 stripped bytes 重建为可显示的 JPEG。
 *
 * 参考: https://core.telegram.org/api/files#stripped-thumbnails
 */
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x28, 0x1c, 0x1e, 0x23, 0x1e, 0x19, 0x28, 0x23, 0x21, 0x23, 0x2d,
  0x2b, 0x28, 0x30, 0x3c, 0x64, 0x41, 0x3c, 0x37, 0x37, 0x3c, 0x7b, 0x58,
  0x5d, 0x49, 0x64, 0x91, 0x80, 0x99, 0x96, 0x8f, 0x80, 0x8c, 0x8a, 0xa0,
  0xb4, 0xe6, 0xc3, 0xa0, 0xaa, 0xda, 0xad, 0x8a, 0x8c, 0xc8, 0xff, 0xcb,
  0xda, 0xee, 0xf5, 0xff, 0xff, 0xff, 0x9b, 0xc1, 0xff, 0xff, 0xff, 0xfa,
  0xff, 0xe6, 0xfd, 0xff, 0xf8, 0xff, 0xdb, 0x00, 0x43, 0x01, 0x2b, 0x2d,
  0x2d, 0x3c, 0x35, 0x3c, 0x76, 0x41, 0x41, 0x76, 0xf8, 0xa5, 0x8c, 0xa5,
  0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
  0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
  0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
  0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
  0xf8, 0xf8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x00, 0x00, 0x00, 0x03,
  0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xc4, 0x00,
  0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
  0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00,
  0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00,
  0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21,
  0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81,
  0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24,
  0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25,
  0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a,
  0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56,
  0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a,
  0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86,
  0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99,
  0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6,
  0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9,
  0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1,
  0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xc4, 0x00,
  0x1f, 0x01, 0x00, 0x03, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
  0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x11, 0x00,
  0x02, 0x01, 0x02, 0x04, 0x04, 0x03, 0x04, 0x07, 0x05, 0x04, 0x04, 0x00,
  0x01, 0x02, 0x77, 0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31,
  0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08,
  0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15,
  0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18,
  0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55,
  0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97,
  0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa,
  0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4,
  0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7,
  0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
  0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00,
  0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00,
]);
const JPEG_FOOTER = Buffer.from([0xff, 0xd9]);

/**
 * 将 Telegram stripped thumbnail 字节重建为完整 JPEG。
 * stripped 第 1 字节为高度，第 2 字节为宽度，其余为扫描数据。
 */
function rebuildStrippedJpeg(stripped: Buffer): Buffer {
  if (!stripped || stripped.length < 3) return Buffer.alloc(0);

  const header = Buffer.from(JPEG_HEADER);
  // 在 SOF0 marker 中写入高度与宽度（偏移 164, 166）
  header[164] = stripped[1]; // height
  header[166] = stripped[2]; // width

  return Buffer.concat([header, stripped.subarray(3), JPEG_FOOTER]);
}

// --- 媒体类型定义 ---

export type MediaType =
  | "photo"
  | "video"
  | "sticker"
  | "document"
  | "voice"
  | "audio"
  | "gif"
  | "videoNote"
  | "contact"
  | "geo"
  | "poll";

export interface MediaInfo {
  mediaType: MediaType;
  mediaFileName: string | null;
  mediaFileSize: number | null;
  mediaMimeType: string | null;
  mediaDuration: number | null;
  mediaThumbBase64: string | null;
  mediaExtra: string | null; // JSON string
}

// --- Document attribute 辅助 ---

/** 从 document.attributes 中查找指定类型的 attribute */
function findAttribute(doc: any, className: string): any | undefined {
  return doc?.attributes?.find?.((a: any) => a?.className === className);
}

/** 从 document 的 attributes 中提取 MIME 类型 */
function getDocMimeType(doc: any): string | null {
  return typeof doc?.mimeType === "string" ? doc.mimeType : null;
}

/** 从 document 的 size 字段提取文件大小 */
function getDocSize(doc: any): number | null {
  if (typeof doc?.size === "number") return doc.size;
  // GramJS 有时用 BigInt
  if (doc?.size != null) {
    const n = Number(doc.size);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// --- Photo 缩略图提取 ---

/** 从 Photo 的 sizes 数组中提取 stripped thumbnail 并转为 base64 */
function extractPhotoThumbBase64(photo: any): string | null {
  if (!photo?.sizes || !Array.isArray(photo.sizes)) return null;

  const stripped = photo.sizes.find(
    (s: any) => s?.className === "PhotoStrippedSize",
  );
  if (!stripped?.bytes) return null;

  const jpegBuf = rebuildStrippedJpeg(Buffer.from(stripped.bytes));
  return jpegBuf.length > 0 ? jpegBuf.toString("base64") : null;
}

/** 从 Photo 的 sizes 中提取最大尺寸的宽高 */
function extractPhotoSize(photo: any): { w: number; h: number } | null {
  if (!photo?.sizes || !Array.isArray(photo.sizes)) return null;

  // 优先取 PhotoSize / PhotoSizeProgressive（有明确 w/h）
  for (const size of [...photo.sizes].reverse()) {
    if (typeof size?.w === "number" && typeof size?.h === "number") {
      return { w: size.w, h: size.h };
    }
  }
  return null;
}

// --- Document 缩略图提取 ---

/** 从 Document 的 thumbs 数组中提取 stripped thumbnail */
function extractDocThumbBase64(doc: any): string | null {
  if (!doc?.thumbs || !Array.isArray(doc.thumbs)) return null;

  const stripped = doc.thumbs.find(
    (s: any) => s?.className === "PhotoStrippedSize",
  );
  if (!stripped?.bytes) return null;

  const jpegBuf = rebuildStrippedJpeg(Buffer.from(stripped.bytes));
  return jpegBuf.length > 0 ? jpegBuf.toString("base64") : null;
}

// --- 主提取函数 ---

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
      const doc = media.document;
      if (!doc) return null;

      const mime = getDocMimeType(doc);
      const fileSize = getDocSize(doc);
      const thumbBase64 = extractDocThumbBase64(doc);

      // 判断具体子类型
      const videoAttr = findAttribute(doc, "DocumentAttributeVideo");
      const audioAttr = findAttribute(doc, "DocumentAttributeAudio");
      const stickerAttr = findAttribute(doc, "DocumentAttributeSticker");
      const animatedAttr = findAttribute(doc, "DocumentAttributeAnimated");
      const filenameAttr = findAttribute(doc, "DocumentAttributeFilename");

      const fileName = filenameAttr?.fileName ?? null;

      // Sticker（静态或动态）
      if (stickerAttr) {
        return {
          mediaType: "sticker",
          mediaFileName: fileName,
          mediaFileSize: fileSize,
          mediaMimeType: mime,
          mediaDuration: null,
          mediaThumbBase64: thumbBase64,
          mediaExtra: stickerAttr.alt
            ? JSON.stringify({ emoji: stickerAttr.alt })
            : null,
        };
      }

      // GIF / 动图
      if (animatedAttr || mime === "image/gif") {
        return {
          mediaType: "gif",
          mediaFileName: fileName,
          mediaFileSize: fileSize,
          mediaMimeType: mime,
          mediaDuration: videoAttr
            ? Math.round(videoAttr.duration ?? 0)
            : null,
          mediaThumbBase64: thumbBase64,
          mediaExtra: videoAttr
            ? JSON.stringify({ w: videoAttr.w, h: videoAttr.h })
            : null,
        };
      }

      // 视频消息（圆形小视频）
      if (videoAttr?.roundMessage) {
        return {
          mediaType: "videoNote",
          mediaFileName: fileName,
          mediaFileSize: fileSize,
          mediaMimeType: mime,
          mediaDuration: Math.round(videoAttr.duration ?? 0),
          mediaThumbBase64: thumbBase64,
          mediaExtra: JSON.stringify({
            w: videoAttr.w,
            h: videoAttr.h,
          }),
        };
      }

      // 普通视频
      if (videoAttr || media.video) {
        return {
          mediaType: "video",
          mediaFileName: fileName,
          mediaFileSize: fileSize,
          mediaMimeType: mime,
          mediaDuration: videoAttr
            ? Math.round(videoAttr.duration ?? 0)
            : null,
          mediaThumbBase64: thumbBase64,
          mediaExtra: videoAttr
            ? JSON.stringify({ w: videoAttr.w, h: videoAttr.h })
            : null,
        };
      }

      // 语音消息
      if (audioAttr?.voice || media.voice) {
        return {
          mediaType: "voice",
          mediaFileName: fileName,
          mediaFileSize: fileSize,
          mediaMimeType: mime,
          mediaDuration: audioAttr
            ? Math.round(audioAttr.duration ?? 0)
            : null,
          mediaThumbBase64: null,
          mediaExtra: null,
        };
      }

      // 普通音频
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

      // 通用文件 / 文档
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

/**
 * 统一获取消息的文本内容（text 或 caption）。
 * 带媒体的消息可能在 message.message 中存储 caption。
 */
export function getMessageTextContent(message: any): string {
  if (typeof message?.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }
  if (
    typeof message?.message === "string" &&
    message.message.trim().length > 0
  ) {
    return message.message;
  }
  return "";
}

/**
 * 判断消息是否有有效内容（文字或媒体），用于替代原先的纯文字过滤。
 */
export function hasMessageContent(message: any): boolean {
  if (!message) return false;
  // 有文字内容
  if (getMessageTextContent(message).length > 0) return true;
  // 有媒体
  if (message.media && message.media.className !== "MessageMediaEmpty") {
    return true;
  }
  return false;
}
