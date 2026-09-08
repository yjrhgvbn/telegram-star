/** Media metadata comes from persisted Telegram messages and can be absent or
 * malformed in older records. UI and virtual-height estimation share validation. */
export function parseMessageMediaExtra(extra: string | null): Record<string, unknown> {
  if (!extra) return {};
  try {
    const value: unknown = JSON.parse(extra);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function getVisualMediaRatio(extra: string | null): number | null {
  const metadata = parseMessageMediaExtra(extra);
  const width = Number(metadata.w);
  const height = Number(metadata.h);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? width / height
    : null;
}
