import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  Inbox,
  ListFilter,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { useMessageScrollEdges } from "../hooks/useMessageScrollEdges";
import { useMessageScrollPositioning } from "../hooks/useMessageScrollPositioning";
import { useReadSyncOnVisibility } from "../hooks/useReadSyncOnVisibility";
import {
  clearMessageHeightEstimateCache,
  estimateMessageItemHeight,
  getMessageListEstimateWidth,
} from "../utils/messageHeightEstimator";
import { MessageCard } from "./MessageCard";

interface Props {
  messages: Message[];         // ASC 顺序（旧→新）
  hasOlder: boolean;           // 是否有更旧消息
  hasNewer: boolean;           // 是否有更新消息
  loading: boolean;            // 初始加载中
  loadingOlder: boolean;       // 正在向上加载
  loadingNewer: boolean;       // 正在向下加载
  anchorId: number | null;     // 定位锚点，null 时滚到底部
  hasPendingNew: boolean;      // 是否有待显示的新消息（显示 badge）
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onFlushPending: () => void;
  onSetAtBottom: (v: boolean) => void;
  onToggleRead: (id: number) => void;
  onOpenTelegram: (id: number) => void;
  markAsReadLocal: (ids: number[]) => void;
  searchQuery?: string;
}

interface MessageEstimateDimensions {
  containerWidth: number;
  viewportWidth: number;
}

const DEFAULT_ESTIMATE_VIEWPORT_WIDTH = 1024;
const HISTORY_STATUS_HEIGHT = 40;
const MESSAGE_SCROLL_END_THRESHOLD = 50;

function useMessageEstimateDimensions(
  scrollRef: RefObject<HTMLDivElement | null>,
): MessageEstimateDimensions {
  const [dimensions, setDimensions] = useState<MessageEstimateDimensions>(() => ({
    containerWidth: getMessageListEstimateWidth(),
    viewportWidth: typeof window === "undefined"
      ? DEFAULT_ESTIMATE_VIEWPORT_WIDTH
      : window.innerWidth,
  }));

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const ownerWindow = element.ownerDocument.defaultView;
    const updateDimensions = () => {
      const nextDimensions = {
        containerWidth: getMessageListEstimateWidth(element.clientWidth),
        viewportWidth: ownerWindow?.innerWidth ?? DEFAULT_ESTIMATE_VIEWPORT_WIDTH,
      };

      setDimensions((current) =>
        current.containerWidth === nextDimensions.containerWidth &&
        current.viewportWidth === nextDimensions.viewportWidth
          ? current
          : nextDimensions,
      );
    };

    updateDimensions();
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    const observer = ResizeObserverConstructor
      ? new ResizeObserverConstructor(updateDimensions)
      : null;
    observer?.observe(element);
    ownerWindow?.addEventListener("resize", updateDimensions, { passive: true });

    return () => {
      observer?.disconnect();
      ownerWindow?.removeEventListener("resize", updateDimensions);
    };
  }, [scrollRef]);

  return dimensions;
}

function MessageListLoadingState() {
  return (
    <div
      className="flex min-h-full items-center justify-center p-4"
      role="status"
      aria-live="polite"
    >
      <Badge variant="secondary" className="h-8 px-3 shadow-sm">
        <Loader2 className="animate-spin" data-icon="inline-start" />
        正在同步消息
      </Badge>
    </div>
  );
}

function MessageListEmptyState() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-card/86" size="sm">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <Inbox className="size-4" />
          </div>
          <CardTitle className="text-base">等待下一条命中消息</CardTitle>
          <CardDescription>
            连接与过滤规则都在运行，符合条件的内容会自动进入这里。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-lg bg-muted/45 px-3 py-2.5 text-center">
            <span className="flex min-w-0 flex-col items-center gap-1 text-xs font-medium">
              <MessageSquareText className="size-3.5 text-primary" />
              Telegram
            </span>
            <span className="h-px w-4 bg-border" aria-hidden />
            <span className="flex min-w-0 flex-col items-center gap-1 text-xs font-medium">
              <ListFilter className="size-3.5 text-primary" />
              过滤规则
            </span>
            <span className="h-px w-4 bg-border" aria-hidden />
            <span className="flex min-w-0 flex-col items-center gap-1 text-xs font-medium">
              <Inbox className="size-3.5 text-primary" />
              消息箱
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageHistoryStatus({
  loadingOlder,
  hasOlder,
  onLoadOlder,
}: Pick<Props, "loadingOlder" | "hasOlder" | "onLoadOlder">) {
  return (
    <div
      className="absolute inset-x-0 top-0 flex h-10 items-center justify-center text-xs text-muted-foreground"
      aria-live="polite"
    >
      {loadingOlder ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载历史消息
        </span>
      ) : hasOlder ? (
        <Button type="button" variant="ghost" size="xs" onClick={onLoadOlder}>
          <ArrowUp data-icon="inline-start" />
          加载更早消息
        </Button>
      ) : (
        <span>已加载全部历史消息</span>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  hasOlder,
  hasNewer,
  loading,
  loadingOlder,
  loadingNewer,
  anchorId,
  hasPendingNew,
  onLoadOlder,
  onLoadNewer,
  onFlushPending,
  onSetAtBottom,
  onToggleRead,
  onOpenTelegram,
  markAsReadLocal,
  searchQuery,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const estimateDimensions = useMessageEstimateDimensions(scrollRef);
  const hasRenderableMessages = !loading && messages.length > 0;

  const estimateSize = useCallback(
    (index: number) => {
      const message = messages[index];
      return message
        ? estimateMessageItemHeight(message, estimateDimensions)
        : 300;
    },
    [estimateDimensions, messages],
  );

  const getItemKey = useCallback(
    (index: number) => messages[index]?.id ?? index,
    [messages],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    enabled: hasRenderableMessages,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: MESSAGE_SCROLL_END_THRESHOLD,
    paddingStart: HISTORY_STATUS_HEIGHT,
    overscan: 8,
    directDomUpdates: true,
  });

  // Width changes invalidate estimates for rows that have not reached the DOM.
  useLayoutEffect(() => {
    if (hasRenderableMessages) {
      virtualizer.measure();
    }
  }, [
    estimateDimensions.containerWidth,
    estimateDimensions.viewportWidth,
    hasRenderableMessages,
    virtualizer,
  ]);

  // Pretext caches canvas font metrics; refresh them once Geist is available.
  useEffect(() => {
    const fonts = scrollRef.current?.ownerDocument.fonts;
    if (!fonts) return;

    let cancelled = false;
    void fonts.ready.then(() => {
      if (cancelled) return;
      clearMessageHeightEstimateCache();
      virtualizer.measure();
    });

    return () => {
      cancelled = true;
    };
  }, [virtualizer]);

  useMessageScrollEdges({
    scrollRef,
    enabled: hasRenderableMessages,
    hasOlder,
    hasNewer,
    loadingOlder,
    loadingNewer,
    onLoadOlder,
    onLoadNewer,
    onSetAtBottom,
  });

  useMessageScrollPositioning({
    messages,
    loading,
    anchorId,
    virtualizer,
  });

  useReadSyncOnVisibility({ messages, markAsReadLocal });

  const handleFlushPending = useCallback(() => {
    // Move to the current end first so followOnAppend keeps the incoming page pinned.
    virtualizer.scrollToEnd();
    onFlushPending();
  }, [onFlushPending, virtualizer]);

  const virtualItems = hasRenderableMessages ? virtualizer.getVirtualItems() : [];
  const showHeightDebug =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("debugMessageHeights");

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-y-contain [overflow-anchor:none] [scrollbar-gutter:stable]"
        data-message-scroll
        aria-busy={loading || loadingOlder || loadingNewer}
      >
        {loading ? (
          <MessageListLoadingState />
        ) : messages.length === 0 ? (
          <MessageListEmptyState />
        ) : (
          <div
            ref={virtualizer.containerRef}
            style={{
              width: "100%",
              position: "relative",
            }}
          >
            <MessageHistoryStatus
              loadingOlder={loadingOlder}
              hasOlder={hasOlder}
              onLoadOlder={onLoadOlder}
            />

            {virtualItems.map((virtualItem) => {
              const message = messages[virtualItem.index];
              let diffElement = null;
              if (showHeightDebug) {
                const estimatedHeight = estimateMessageItemHeight(message, estimateDimensions);
                const diff = virtualItem.size - estimatedHeight;

                diffElement = (
                  <div className="pointer-events-none absolute top-1 right-[max(1.5rem,calc((100%-980px)/2+1.5rem))] z-20 rounded-md bg-foreground/65 px-2 py-1 font-mono text-[10px] text-background/90 shadow-sm backdrop-blur-sm">
                    <span className={Math.abs(diff) > 20 ? "font-bold text-destructive" : "text-success"}>
                      Diff: {diff > 0 ? "+" : ""}{diff.toFixed(2)}px
                    </span>
                    <span className="ml-2 opacity-70">
                      Est {estimatedHeight.toFixed(0)} / Real {virtualItem.size.toFixed(0)}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                  }}
                >
                  {diffElement}

                  <div className="mx-auto w-full max-w-[980px] px-3 pb-2 sm:px-4">
                    <MessageCard
                      message={message}
                      onToggleRead={onToggleRead}
                      onOpenTelegram={onOpenTelegram}
                      searchQuery={searchQuery}
                      isAnchor={message.id === anchorId}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hasRenderableMessages && loadingNewer ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 flex justify-center",
            hasPendingNew ? "bottom-14" : "bottom-4",
          )}
          role="status"
        >
          <Badge variant="secondary" className="h-7 px-3 shadow-sm">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            加载新消息
          </Badge>
        </div>
      ) : null}

      {hasPendingNew ? (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <Button
            size="sm"
            variant="default"
            className="rounded-full px-4 shadow-md"
            onClick={handleFlushPending}
          >
            <ArrowDown data-icon="inline-start" />
            有新消息
          </Button>
        </div>
      ) : null}
    </div>
  );
}
