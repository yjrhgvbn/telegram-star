export function findDocumentAttribute(doc: any, className: string): any | undefined {
  return doc?.attributes?.find?.((attribute: any) => attribute?.className === className);
}

export function getDocumentMimeType(doc: any): string | null {
  return typeof doc?.mimeType === "string" ? doc.mimeType : null;
}

export function getDocumentSize(doc: any): number | null {
  if (typeof doc?.size === "number") return doc.size;
  if (doc?.size != null) {
    const value = Number(doc.size);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function getDocumentFileName(doc: any): string | null {
  const filenameAttribute = findDocumentAttribute(doc, "DocumentAttributeFilename");
  return filenameAttribute?.fileName ?? null;
}
