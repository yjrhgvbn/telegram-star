import {
  messageContentLinksSchema,
  type MessageContentLink,
} from "@telegram-star/shared/contracts/messages";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "tg:", "mailto:", "tel:"]);

function normalizeMessageLink(rawUrl: string): string | null {
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

/** 提取 Telegram URL/TextUrl 实体；offset/length 与 JS 字符串一样均采用 UTF-16 单位。 */
export function extractMessageContentLinks(
  message: any,
  content: string,
): MessageContentLink[] {
  if (!Array.isArray(message?.entities) || !content) return [];

  const links: MessageContentLink[] = [];
  const seen = new Set<string>();

  for (const entity of message.entities) {
    const className = String(entity?.className ?? entity?.constructor?.name ?? "");
    if (className !== "MessageEntityTextUrl" && className !== "MessageEntityUrl") continue;

    const offset = Number(entity?.offset);
    const length = Number(entity?.length);
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length <= 0 ||
      offset + length > content.length
    ) {
      continue;
    }

    const rawUrl = className === "MessageEntityTextUrl"
      ? entity?.url
      : content.slice(offset, offset + length);
    if (typeof rawUrl !== "string") continue;

    const url = normalizeMessageLink(rawUrl);
    if (!url) continue;

    const key = `${offset}:${length}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ offset, length, url });
  }

  return links.sort((a, b) => a.offset - b.offset || a.length - b.length);
}

export function serializeMessageContentLinks(links: MessageContentLink[]): string {
  return JSON.stringify(messageContentLinksSchema.parse(links));
}

export function parseMessageContentLinks(value: string | null): MessageContentLink[] {
  if (!value) return [];

  try {
    const parsed = messageContentLinksSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
