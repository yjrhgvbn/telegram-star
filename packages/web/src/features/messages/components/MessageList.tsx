import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Message } from "@/types";
import { useMessageScrollEdges } from "../hooks/useMessageScrollEdges";
import { useMessageScrollPositioning } from "../hooks/useMessageScrollPositioning";
import { useReadSyncOnVisibility } from "../hooks/useReadSyncOnVisibility";
import type { MessageOrder, MessageReadFilter, MessageViewPosition } from "../hooks/useMessageViewState";
import { clearMessageHeightEstimateCache, estimateMessageItemHeight, getMessageListEstimateWidth } from "../utils/messageHeightEstimator";
import { MessageCard } from "./MessageCard";

interface Props {
  messages: Message[];
  hasOlder: boolean;
  hasNewer: boolean;
  loading: boolean;
  error?: string | null;
  loadingOlder: boolean;
  loadingNewer: boolean;
  anchorId: number | null;
  hasPendingNew: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onFlushPending: () => void;
  onSetAtBottom: (value: boolean) => void;
  onToggleRead: (id: number) => void;
  onOpenTelegram: (id: number) => void;
  markAsReadLocal: (ids: number[]) => void;
  searchQuery?: string;
  readFilter?: MessageReadFilter;
  order?: MessageOrder;
  restorePosition?: MessageViewPosition | null;
  onRememberPosition?: (position: MessageViewPosition | null) => void;
  onRetry?: () => void;
  locateRequest?: number;
  onLocateHandled?: () => void;
  isSelecting?: boolean;
  selectedIds?: ReadonlySet<number>;
  pendingIds?: ReadonlySet<number>;
  onSelect?: (id: number) => void;
  onRemove?: (id: number) => void;
  removalPending?: boolean;
  removalLabel?: string;
}
interface MessageEstimateDimensions { containerWidth: number; viewportWidth: number }
const DEFAULT_ESTIMATE_VIEWPORT_WIDTH = 1024;
const HISTORY_STATUS_HEIGHT = 36;
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

export function MessageList({
  messages, hasOlder, hasNewer, loading, error, loadingOlder, loadingNewer, anchorId,
  hasPendingNew, onLoadOlder, onLoadNewer, onFlushPending, onSetAtBottom, onToggleRead,
  onOpenTelegram, markAsReadLocal, searchQuery, readFilter = "all", order = "asc",
  restorePosition, onRememberPosition, onRetry, locateRequest = 0, onLocateHandled,
  isSelecting, selectedIds, pendingIds, onSelect,
  onRemove, removalPending = false, removalLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dimensions = useMessageEstimateDimensions(scrollRef);
  const orderedMessages = useMemo(() => order === "asc" ? messages : [...messages].reverse(), [messages, order]);
  const hasMessages = !loading && orderedMessages.length > 0;
  const lastVisiblePosition = useRef<MessageViewPosition | null>(null);
  const lastLayout = useRef({ ...dimensions, isSelecting });
  const handledLocate = useRef(0);
  const [locatedId, setLocatedId] = useState<number | null>(null);
  const estimateSize = useCallback((index: number) => {
    const message = orderedMessages[index];
    return message ? estimateMessageItemHeight(message, dimensions) : 300;
  }, [dimensions, orderedMessages]);
  const getItemKey = useCallback((index: number) => orderedMessages[index]?.id ?? index, [orderedMessages]);
  const virtualizer = useVirtualizer({
    count: orderedMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize, getItemKey, enabled: hasMessages,
    // End anchoring preserves a visible row on both prepend and append. Only
    // chronological mode follows the latest edge; reverse mode announces arrivals.
    anchorTo: "end", followOnAppend: order === "asc",
    scrollEndThreshold: MESSAGE_SCROLL_END_THRESHOLD,
    paddingStart: HISTORY_STATUS_HEIGHT,
    overscan: 8, directDomUpdates: true,
  });

  useLayoutEffect(() => {
    const previous = lastLayout.current;
    const resized = previous.containerWidth !== dimensions.containerWidth;
    const changed = resized || previous.viewportWidth !== dimensions.viewportWidth || previous.isSelecting !== isSelecting;
    lastLayout.current = { ...dimensions, isSelecting };
    // The initial row refs already measured the committed layout. Clearing those
    // sizes on every group entry makes restoration use estimates again.
    if (!hasMessages || !changed) return;
    const saved = resized ? lastVisiblePosition.current : null;
    virtualizer.measure();
    if (saved) {
      const index = orderedMessages.findIndex((message) => message.id === saved.messageId);
      if (index >= 0) {
        // Establish the library's indexed-scroll transaction first: this also
        // enables synchronous measurements if a resize interrupted user scroll.
        virtualizer.scrollToIndex(index, { align: "start" });
        // measure() invalidates cached heights but does not remeasure mounted
        // rows. Their refs are unchanged after a width update, and waiting for
        // ResizeObserver can let the indexed scroll settle against estimates.
        // Read the committed new-width layout before paint, then land exactly.
        scrollRef.current?.querySelectorAll<HTMLElement>("[data-message-id]").forEach((row) => virtualizer.measureElement(row));
        if (previous.viewportWidth === dimensions.viewportWidth) {
          // On mobile, loading a scrollable list introduces a scrollbar after
          // restoration (e.g. 390px -> 384px). Keep the row's saved offset when
          // only the content width changes; this is not a device resize.
          const measured = virtualizer.getVirtualItems().find((item) => item.index === index);
          if (measured) virtualizer.scrollToOffset(measured.start + saved.offset, { align: "start" });
        } else {
          virtualizer.scrollToIndex(index, { align: "start" });
          lastVisiblePosition.current = { messageId: saved.messageId, offset: 0 };
        }
      }
    } else {
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-message-id]").forEach((row) => virtualizer.measureElement(row));
    }
  }, [dimensions.containerWidth, dimensions.viewportWidth, hasMessages, virtualizer, isSelecting]);
  useEffect(() => {
    const fonts = scrollRef.current?.ownerDocument.fonts;
    if (!fonts || fonts.status === "loaded") return;
    let cancelled = false;
    void fonts.ready.then(() => {
      if (cancelled) return;
      clearMessageHeightEstimateCache();
      virtualizer.measure();
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-message-id]").forEach((row) => virtualizer.measureElement(row));
    });
    return () => { cancelled = true; };
  }, [virtualizer]);

  const handleAtLatest = useCallback((atBottom: boolean) => {
    onSetAtBottom(order === "asc" && atBottom);
  }, [onSetAtBottom, order]);
  useMessageScrollEdges({
    scrollRef, enabled: hasMessages,
    hasOlder: order === "asc" ? hasOlder : hasNewer,
    hasNewer: order === "asc" ? hasNewer : hasOlder,
    loadingOlder: order === "asc" ? loadingOlder : loadingNewer,
    loadingNewer: order === "asc" ? loadingNewer : loadingOlder,
    onLoadOlder: order === "asc" ? onLoadOlder : onLoadNewer,
    onLoadNewer: order === "asc" ? onLoadNewer : onLoadOlder,
    onSetAtBottom: handleAtLatest,
  });
  const hasPositioned = useMessageScrollPositioning({ messages: orderedMessages, loading, anchorId, virtualizer, restorePosition, scrollRef, order });
  useReadSyncOnVisibility({ messages, markAsReadLocal });

  const savePosition = useCallback(() => {
    const element = scrollRef.current;
    if (!hasMessages || !hasPositioned.current || !element?.clientHeight) return;
    const viewport = element.getBoundingClientRect();
    const top = viewport.top + element.clientTop;
    // Save what is actually painted, not a virtual measurement that may be
    // awaiting a ResizeObserver update or a direct-DOM transform.
    const first = [...element.querySelectorAll<HTMLElement>("[data-message-id]")]
      .find((row) => row.getBoundingClientRect().bottom > top + 1);
    if (first) {
      const position = { messageId: Number(first.dataset.messageId), offset: top - first.getBoundingClientRect().top };
      lastVisiblePosition.current = position;
      onRememberPosition?.(position);
    }
  }, [hasMessages, hasPositioned, onRememberPosition]);
  const latestSave = useRef(savePosition);
  latestSave.current = savePosition;
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const save = () => latestSave.current();
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(save);
    };
    element.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      cancelAnimationFrame(frame);
      // Layout cleanup runs while the old group's DOM is still available, so
      // a switch in the same frame as a scroll does not lose its last position.
      save();
      element.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", save);
    };
  }, []);
  useLayoutEffect(() => {
    if (!hasMessages) return;
    // Initial positioning need not emit a scroll event for a short list.
    handleAtLatest(Boolean(scrollRef.current && scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < MESSAGE_SCROLL_END_THRESHOLD));

  }, [hasMessages, loadingNewer, orderedMessages, order, virtualizer, handleAtLatest]);
  useEffect(() => {
    if (loading || !locateRequest || handledLocate.current === locateRequest) return;
    const firstVisible = virtualizer.getVirtualItemForOffset(scrollRef.current?.scrollTop ?? 0)?.index ?? 0;
    const candidates = orderedMessages.map((message, index) => ({ message, index })).filter(({ message }) => !message.isRead);
    const target = candidates.find(({ index }) => index > firstVisible) ?? candidates[0];
    handledLocate.current = locateRequest;
    onLocateHandled?.();
    if (!target) return;
    virtualizer.scrollToIndex(target.index, { align: "start" });
    setLocatedId(target.message.id);
  }, [loading, locateRequest, orderedMessages, virtualizer, onLocateHandled]);

  const virtualItems = hasMessages ? virtualizer.getVirtualItems() : [];
  const topLoading = order === "asc" ? loadingOlder : loadingNewer;
  const topAvailable = order === "asc" ? hasOlder : hasNewer;
  const topLoad = order === "asc" ? onLoadOlder : onLoadNewer;
  const bottomLoading = order === "asc" ? loadingNewer : loadingOlder;
  const emptyTitle = searchQuery ? "没有匹配的消息" : readFilter === "unread" ? "当前消息都已完成" : readFilter === "read" ? "还没有已完成的消息" : "这里还没有消息";

  return (
    <div className="relative h-full w-full">
      <div ref={scrollRef} className="messages-list" data-message-scroll aria-label="当前消息组的消息" aria-busy={loading || loadingOlder || loadingNewer} tabIndex={-1}>
        {loading ? (
          <div className="flex flex-col gap-8 p-6" role="status" aria-label="正在加载消息">
            {[0, 1, 2].map((id) => <div key={id} className="flex gap-3"><Skeleton className="size-8 rounded-full" /><div className="flex flex-1 flex-col gap-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div></div>)}
          </div>
        ) : !messages.length ? (
          <div className="messages-list-empty" role={error ? "alert" : undefined}>
            <p>{error ? "消息暂时无法加载" : emptyTitle}</p>
            <small>{error || (searchQuery ? "换个关键词，或清除搜索条件再试。" : readFilter === "all" ? "符合监听条件的消息会显示在这里。" : "可以切换到全部消息查看。")}</small>
            {error && onRetry && <Button variant="outline" onClick={onRetry}>重试</Button>}
          </div>
        ) : (
          <>
            {error && <div className="messages-list-error" role="alert"><span>{error}</span><Button variant="ghost" onClick={onRetry}>重试</Button></div>}
            <div ref={virtualizer.containerRef} style={{ width: "100%", position: "relative" }}>
              <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-center text-xs text-muted-foreground" aria-live="polite">
                {topLoading ? <span className="flex items-center gap-2"><Loader2 className="size-3 animate-spin" />加载消息</span> : topAvailable ? <Button variant="ghost" size="xs" onClick={topLoad}><ArrowUp data-icon="inline-start" />{order === "asc" ? "加载更早消息" : "加载更新消息"}</Button> : null}
              </div>
              {virtualItems.map((virtualItem) => {
                const message = orderedMessages[virtualItem.index];
                return <div key={virtualItem.key} data-index={virtualItem.index} data-message-id={message.id} ref={virtualizer.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%" }}>
                  <div className="messages-list-row">
                    <MessageCard message={message} onToggleRead={onToggleRead} onOpenTelegram={onOpenTelegram} searchQuery={searchQuery} isAnchor={message.id === (locatedId ?? anchorId)} isSelecting={isSelecting} isSelected={selectedIds?.has(message.id)} onSelect={onSelect} isReadPending={pendingIds?.has(message.id)} completionDisabled={Boolean(pendingIds?.size) || removalPending} onRemove={onRemove} removalDisabled={removalPending} removalLabel={removalLabel} />
                  </div>
                </div>;
              })}
            </div>
          </>
        )}
      </div>
      {hasMessages && bottomLoading && <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center" role="status"><Badge variant="secondary"><Loader2 className="animate-spin" data-icon="inline-start" />加载消息</Badge></div>}
      {hasPendingNew && <div className="messages-arrival" data-order={order}><Button onClick={() => { if (order === "asc") virtualizer.scrollToEnd(); else virtualizer.scrollToIndex(0, { align: "start" }); onFlushPending(); }}><ArrowDown data-icon="inline-start" />有新消息</Button></div>}
    </div>
  );
}
