import type { MouseEvent, ReactNode } from "react";
import type { MessageContentLink } from "@/types";
import { useClientExternalLink } from "@/shared/runtime/ClientShellBridgeProvider";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "tg:", "mailto:", "tel:"]);
const PLAIN_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?，。！？；：、】）》」』]+$/u;

interface Props {
  content: string;
  links: MessageContentLink[];
  searchQuery?: string;
}

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

export function MessageContent({ content, links, searchQuery }: Props) {
  const handleExternalLink = useClientExternalLink();
  const renderableLinks = collectRenderableLinks(content, links);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const [index, link] of renderableLinks.entries()) {
    if (link.offset > cursor) {
      nodes.push(
        <span key={`text-${index}`}>
          {renderHighlightedText(content.slice(cursor, link.offset), searchQuery, `text-${index}`)}
        </span>,
      );
    }

    const linkedText = content.slice(link.offset, link.offset + link.length);
    nodes.push(
      <a
        key={`link-${link.offset}-${link.length}`}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        onClick={(event: MouseEvent<HTMLAnchorElement>) =>
          handleExternalLink(event, link.url)
        }
      >
        {renderHighlightedText(linkedText, searchQuery, `link-${index}`)}
      </a>,
    );
    cursor = link.offset + link.length;
  }

  if (cursor < content.length) {
    nodes.push(
      <span key="text-tail">
        {renderHighlightedText(content.slice(cursor), searchQuery, "text-tail")}
      </span>,
    );
  }

  return <>{nodes}</>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(content: string, searchQuery: string | undefined, keyPrefix: string) {
  const query = searchQuery?.trim();
  if (!query) return content;

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  return content.split(regex).map((part, index) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={`${keyPrefix}-${index}`}>{part}</mark>
      : part,
  );
}
