import { getCacheStats, getThumbBuffer } from "../../services/mediaCache.js";

// 缩略图是用户私有数据，只允许浏览器本地缓存，不能被共享代理/CDN 复用。
export const MEDIA_THUMB_CACHE_CONTROL = "private, max-age=86400";

export interface MediaThumbParamsInput {
  chatId?: string;
  messageId?: string;
}

export interface MediaThumbRequest {
  chatId: string;
  messageId: number;
}

export interface MediaThumbPayload {
  buffer: Buffer;
  mimeType: string;
  contentLength: number;
  cacheControl: string;
}

export class InvalidMediaThumbParamsError extends Error {
  constructor() {
    super("Invalid chatId or messageId");
    this.name = "InvalidMediaThumbParamsError";
  }
}

export class ThumbnailNotAvailableError extends Error {
  constructor() {
    super("Thumbnail not available");
    this.name = "ThumbnailNotAvailableError";
  }
}

export function parseMediaThumbParams(params: MediaThumbParamsInput): MediaThumbRequest {
  const messageId = Number.parseInt(params.messageId ?? "", 10);

  if (!params.chatId || !messageId || Number.isNaN(messageId)) {
    throw new InvalidMediaThumbParamsError();
  }

  return { chatId: params.chatId, messageId };
}

export async function getMediaThumbPayload(
  request: MediaThumbRequest,
): Promise<MediaThumbPayload> {
  const result = await getThumbBuffer(request.chatId, request.messageId);
  if (!result) {
    throw new ThumbnailNotAvailableError();
  }

  return {
    buffer: result.buffer,
    mimeType: result.mimeType,
    contentLength: result.buffer.byteLength,
    cacheControl: MEDIA_THUMB_CACHE_CONTROL,
  };
}

export function getMediaCacheStats() {
  return getCacheStats();
}
