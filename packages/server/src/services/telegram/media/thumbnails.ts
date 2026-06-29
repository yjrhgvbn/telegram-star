import { rebuildStrippedJpeg } from "./strippedThumbnail.js";

export function extractPhotoThumbBase64(photo: any): string | null {
  return extractStrippedThumbBase64(photo?.sizes);
}

export function extractDocumentThumbBase64(doc: any): string | null {
  return extractStrippedThumbBase64(doc?.thumbs);
}

export function extractPhotoSize(photo: any): { w: number; h: number } | null {
  if (!photo?.sizes || !Array.isArray(photo.sizes)) return null;

  // Telegram sizes 通常从小到大排列，反向找第一个有 w/h 的尺寸就是最大可用预览尺寸。
  for (const size of [...photo.sizes].reverse()) {
    if (typeof size?.w === "number" && typeof size?.h === "number") {
      return { w: size.w, h: size.h };
    }
  }
  return null;
}

function extractStrippedThumbBase64(sizes: unknown): string | null {
  if (!Array.isArray(sizes)) return null;

  const stripped = sizes.find((size: any) => size?.className === "PhotoStrippedSize");
  if (!stripped?.bytes) return null;

  const jpegBuffer = rebuildStrippedJpeg(Buffer.from(stripped.bytes));
  return jpegBuffer.length > 0 ? jpegBuffer.toString("base64") : null;
}
