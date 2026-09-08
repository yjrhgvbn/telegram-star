import { useMemo, type MouseEvent, type ReactNode } from "react";
import type { MessageContentLink } from "@/types";
import { useClientExternalLink } from "@/shared/runtime/ClientShellBridgeProvider";
import { collectRenderableLinks } from "../utils/messageContentPreview";
import "./MessageContent.css";

export { collectRenderableLinks } from "../utils/messageContentPreview";

interface Props {
  content: string;
  links: MessageContentLink[];
  searchQuery?: string;
  mediaFileName?: string | null;
}

export function MessageContent({ content, links, searchQuery, mediaFileName }: Props) {
  const handleExternalLink = useClientExternalLink();
  const renderableLinks = useMemo(() => collectRenderableLinks(content, links), [content, links]);
  const emphasis = useMemo(() => collectFilenameRanges(content, mediaFileName), [content, mediaFileName]);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const [index, link] of renderableLinks.entries()) {
    if (link.offset > cursor) {
      nodes.push(
        <span key={`text-${index}`}>
          {renderOriginalText(content, cursor, link.offset, emphasis, searchQuery, `text-${index}`)}
        </span>,
      );
    }

    nodes.push(
      <a
        key={`link-${link.offset}-${link.length}`}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="message-content-link"
        onClick={(event: MouseEvent<HTMLAnchorElement>) =>
          handleExternalLink(event, link.url)
        }
      >
        {renderOriginalText(content, link.offset, link.offset + link.length, emphasis, searchQuery, `link-${index}`)}
      </a>,
    );
    cursor = link.offset + link.length;
  }

  if (cursor < content.length) {
    nodes.push(
      <span key="text-tail">
        {renderOriginalText(content, cursor, content.length, emphasis, searchQuery, "text-tail")}
      </span>,
    );
  }

  return <>{nodes}</>;
}

interface TextRange { start: number; end: number }

/** Emphasize only a real attachment filename or an explicitly labelled media
 * filename. All ranges use original UTF-16 offsets and never rewrite captions. */
function collectFilenameRanges(content: string, mediaFileName?: string | null): TextRange[] {
  const ranges: TextRange[] = [];
  if (mediaFileName?.trim()) {
    let start = content.indexOf(mediaFileName);
    while (start !== -1) {
      ranges.push({ start, end: start + mediaFileName.length });
      start = content.indexOf(mediaFileName, start + mediaFileName.length);
    }
  }
  const labelledFile = /(?:^|\n)(【(?:番名|檔案名稱|文件名|文件名称)】[：:]?[ \t]*)([^\n]+\.(?:mp4|mkv|avi|mov|webm|m4v))[ \t]*(?=\n|$)/gi;
  for (const match of content.matchAll(labelledFile)) {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0) + match[1].length;
    ranges.push({ start, end: start + match[2].length });
  }
  const merged: TextRange[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function renderOriginalText(content: string, start: number, end: number, ranges: TextRange[], query: string | undefined, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = start;
  for (const range of ranges) {
    if (range.end <= start || range.start >= end) continue;
    const rangeStart = Math.max(start, range.start);
    const rangeEnd = Math.min(end, range.end);
    if (rangeStart > cursor) nodes.push(renderHighlightedText(content.slice(cursor, rangeStart), query, `${keyPrefix}-${cursor}`));
    nodes.push(<strong key={`${keyPrefix}-file-${rangeStart}`}>{renderHighlightedText(content.slice(rangeStart, rangeEnd), query, `${keyPrefix}-${rangeStart}`)}</strong>);
    cursor = rangeEnd;
  }
  if (cursor < end) nodes.push(renderHighlightedText(content.slice(cursor, end), query, `${keyPrefix}-${cursor}`));
  return nodes;
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
