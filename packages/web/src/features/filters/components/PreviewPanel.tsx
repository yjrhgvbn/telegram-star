import { useDeferredValue, useEffect, useState, type ReactNode, type UIEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { HistoricalFilterPreviewMessage } from "@/types";

interface PreviewSummary {
  scannedChats: number;
  total: number;
}

interface PreviewPanelProps {
  previewEnabled: boolean;
  previewLoading: boolean;
  previewStale: boolean;
  previewError: string;
  previewMessages: HistoricalFilterPreviewMessage[];
  previewSummary: PreviewSummary | null;
  previewLimit: string;
  onPreviewLimitChange: (value: string) => void;
  className?: string;
}

const PAGE_SIZE = 20;
const scopeOptions = [
  { value: "50", label: "最近 50 条 / 会话" },
  { value: "200", label: "最近 200 条 / 会话" },
  { value: "500", label: "最近 500 条 / 会话" },
  { value: "1000", label: "最近 1,000 条 / 会话" },
];

function cleanPreviewContent(content: string): string {
  return content
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderHighlightedContent(
  content: string,
  matchedKeyword: string | null,
): ReactNode {
  if (!matchedKeyword) return content;

  const start = content.toLocaleLowerCase().indexOf(matchedKeyword.toLocaleLowerCase());
  if (start < 0) return content;

  const end = start + matchedKeyword.length;
  return (
    <>
      {content.slice(0, start)}
      <mark className="rounded bg-primary/14 px-0.5 text-foreground">
        {content.slice(start, end)}
      </mark>
      {content.slice(end)}
    </>
  );
}

function formatMessageDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PreviewPanel({
  previewEnabled,
  previewLoading,
  previewStale,
  previewError,
  previewMessages,
  previewSummary,
  previewLimit,
  onPreviewLimitChange,
  className,
}: PreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredMessages = useDeferredValue(previewMessages);
  const visibleMessages = deferredMessages.slice(0, visibleCount);
  const selectedScope =
    scopeOptions.find((option) => option.value === previewLimit) ?? scopeOptions[1];

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [previewLimit, previewMessages]);

  const resultCount = previewSummary?.total ?? deferredMessages.length;
  const dockStatus = !previewEnabled
    ? "添加有效条件后自动预览"
    : previewError
      ? "预览暂不可用"
      : previewLoading && !previewSummary
        ? "正在匹配…"
        : previewLoading || previewStale
          ? `${resultCount} 条命中 · 更新中`
          : `${resultCount} 条命中`;

  const handleResultScroll = (event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (remaining > 240 || visibleCount >= deferredMessages.length) return;

    setVisibleCount((current) => Math.min(current + PAGE_SIZE, deferredMessages.length));
  };

  return (
    <div className={cn("min-w-0 shrink-0 xl:min-h-0", className)}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="filter-preview-results"
        className={cn(
          "flex h-12 w-full items-center gap-2 border-y border-border bg-card/96 px-3 text-left shadow-[0_-6px_18px_color-mix(in_oklab,var(--foreground)_5%,transparent)] xl:hidden",
          expanded && "hidden",
        )}
        onClick={() => setExpanded(true)}
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full bg-muted-foreground/40",
            previewLoading && "animate-pulse bg-primary",
            previewEnabled && !previewLoading && !previewError && "bg-success",
            previewError && "bg-destructive",
          )}
        />
        <span className="shrink-0 text-sm font-semibold">预览匹配</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {dockStatus}
        </span>
        <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <section
        id="filter-preview-results"
        aria-label="命中消息预览"
        className={cn(
          "h-[min(58dvh,34rem)] min-h-0 flex-col overflow-hidden border-t border-border bg-card shadow-[0_-14px_34px_color-mix(in_oklab,var(--foreground)_10%,transparent)]",
          expanded ? "flex" : "hidden",
          "xl:flex xl:h-full xl:rounded-xl xl:border xl:shadow-[var(--workspace-panel-shadow)]",
        )}
      >
        <header className="flex min-h-13 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">预览匹配</h2>
            <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground xl:block">
              {previewLoading || previewStale ? "自动预览 · 更新中" : "自动预览 · 已更新"}
            </p>
          </div>

          <Select
            items={scopeOptions}
            value={previewLimit}
            onValueChange={(value) => {
              if (value) onPreviewLimitChange(value);
            }}
          >
            <SelectTrigger size="sm" className="max-w-48" aria-label="预览扫描范围">
              <SelectValue>{selectedScope.label}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                {scopeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="xl:hidden"
            onClick={() => setExpanded(false)}
            aria-label="收起预览"
          >
            <ChevronDown />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 text-xs text-muted-foreground">
            <span>命中消息 · 按时间倒序</span>
            <span className="flex items-center gap-1.5">
              {previewLoading ? <LoaderCircle className="size-3 animate-spin text-primary" /> : null}
              <strong className="font-semibold text-primary">{resultCount} 条</strong>
            </span>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              previewStale && "opacity-70",
            )}
            onScroll={handleResultScroll}
          >
            {!previewEnabled ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
                  <Inbox className="size-4" />
                </span>
                <p className="mt-3 text-sm font-semibold">填写一个有效条件</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  条件停顿约 800ms 后会自动显示命中消息。
                </p>
              </div>
            ) : previewError && !previewSummary ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
                <p className="text-sm font-semibold text-destructive">暂时无法完成预览</p>
                <p className="mt-1 max-w-72 text-xs leading-5 text-muted-foreground">
                  {previewError}
                </p>
              </div>
            ) : previewLoading && !previewSummary ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin text-primary" />
                正在匹配历史消息…
              </div>
            ) : deferredMessages.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
                  <Inbox className="size-4" />
                </span>
                <p className="mt-3 text-sm font-semibold">当前范围内没有命中</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  可以调整条件，或扩大右上角的预览范围。
                </p>
              </div>
            ) : (
              <div aria-live="polite">
                {visibleMessages.map((message) => {
                  const content = cleanPreviewContent(message.content) || "媒体消息";
                  const messageDate = formatMessageDate(message.messageDate);

                  return (
                    <article
                      key={`${message.chatId}-${message.id}`}
                      className="relative border-b border-border/72 py-3 pr-3 pl-8 [contain-intrinsic-size:0_116px] [content-visibility:auto] last:border-b-0"
                    >
                      <span className="absolute top-4 left-3 size-2 rounded-full bg-primary ring-4 ring-primary/12" />
                      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate">
                          {message.chatTitle}{messageDate ? ` · ${messageDate}` : ""}
                        </span>
                        {message.telegramLink ? (
                          <a
                            href={message.telegramLink}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="打开 Telegram 原消息"
                            className="grid size-7 shrink-0 place-items-center rounded-lg text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </div>

                      <p className="mt-1.5 line-clamp-5 text-sm leading-6 text-foreground/92">
                        {renderHighlightedContent(content, message.matchedKeyword)}
                      </p>

                      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate">
                          {message.matchedKeyword
                            ? `匹配「${message.matchedKeyword}」`
                            : "符合当前规则"}
                        </span>
                        <span className="hidden shrink-0 sm:inline">
                          {message.inDatabase ? "已在消息列表" : "尚未同步"}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {deferredMessages.length > 0 ? (
            <div className="flex h-10 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground">
              <span>
                已展示 {Math.min(visibleCount, deferredMessages.length)} / {deferredMessages.length}
              </span>
              <span className="font-medium text-primary">
                {visibleCount < deferredMessages.length ? "下滑自动加载" : "已展示全部"}
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
