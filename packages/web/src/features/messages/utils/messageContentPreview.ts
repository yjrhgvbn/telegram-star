import type { MessageContentLink } from "@/types";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "tg:", "mailto:", "tel:"]);
const PLAIN_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?，。！？；：、】）》」』]+$/u;

interface RenderableLink extends MessageContentLink {
  url: string;
}

function normalizeLinkUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol.toLowerCase()) ? candidate : null;
  } catch {
    return null;
  }
}

function overlaps(left: MessageContentLink, right: MessageContentLink): boolean {
  return left.offset < right.offset + right.length && right.offset < left.offset + left.length;
}

/** 合并 Telegram 实体与旧数据中的明文 URL，并丢弃越界、危险协议和重叠范围。 */
export function collectRenderableLinks(
  content: string,
  links: MessageContentLink[],
): RenderableLink[] {
  const candidates: Array<RenderableLink & { explicit: boolean }> = [];

  for (const link of links) {
    const url = normalizeLinkUrl(link.url);
    if (
      !url ||
      !Number.isInteger(link.offset) ||
      !Number.isInteger(link.length) ||
      link.offset < 0 ||
      link.length <= 0 ||
      link.offset + link.length > content.length
    ) {
      continue;
    }
    candidates.push({ ...link, url, explicit: true });
  }

  for (const match of content.matchAll(PLAIN_LINK_PATTERN)) {
    const rawUrl = match[0].replace(TRAILING_URL_PUNCTUATION, "");
    const offset = match.index;
    const url = normalizeLinkUrl(rawUrl);
    if (!url || rawUrl.length === 0) continue;
    candidates.push({ offset, length: rawUrl.length, url, explicit: false });
  }

  candidates.sort(
    (a, b) => a.offset - b.offset || Number(b.explicit) - Number(a.explicit) || b.length - a.length,
  );

  const accepted: RenderableLink[] = [];
  for (const candidate of candidates) {
    if (accepted.some((link) => overlaps(link, candidate))) continue;
    accepted.push({ offset: candidate.offset, length: candidate.length, url: candidate.url });
  }
  return accepted;
}


export const MESSAGE_PREVIEW_CHARACTERS = 560;
export const MESSAGE_PREVIEW_LINES = 8;

/** Keep an untouched prefix so Telegram UTF-16 entity offsets remain valid.
 * When a link crosses the preview boundary, move the boundary before it instead
 * of exposing a shortened URL that could navigate to the wrong destination. */
export function getMessageContentPreview(content: string, links: MessageContentLink[] = []) {
  let end = Math.min(content.length, MESSAGE_PREVIEW_CHARACTERS);
  let lineCount = 0;
  for (let index = 0; index < end; index++) {
    if (content[index] === "\n" && ++lineCount === MESSAGE_PREVIEW_LINES) {
      end = index;
      break;
    }
  }
  if (end === content.length) return { text: content, truncated: false };

  for (const link of collectRenderableLinks(content, links)) {
    const linkEnd = link.offset + link.length;
    if (link.offset < end && linkEnd > end) {
      end = link.offset > 0 ? link.offset : linkEnd;
      break;
    }
  }
  // Telegram offsets use UTF-16; do not split an emoji's surrogate pair.
  const preceding = content.charCodeAt(end - 1);
  const following = content.charCodeAt(end);
  if (preceding >= 0xd800 && preceding <= 0xdbff && following >= 0xdc00 && following <= 0xdfff) end--;
  return { text: content.slice(0, end), truncated: end < content.length };
}
