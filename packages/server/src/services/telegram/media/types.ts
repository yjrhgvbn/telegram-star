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
  mediaExtra: string | null;
}
