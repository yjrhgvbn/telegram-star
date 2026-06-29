import { useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Inbox, Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageCard } from "./MessageCard";
import type { Message } from "@/types";
import { useMessageScrollEdges } from "../hooks/useMessageScrollEdges";
import { useMessageScrollPositioning } from "../hooks/useMessageScrollPositioning";
import { useReadSyncOnVisibility } from "../hooks/useReadSyncOnVisibility";
import { estimateMessageItemHeight } from "../utils/messageHeightEstimator";

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
  markAsReadLocal: (ids: number[]) => void;
  searchQuery?: string;
}

const DEFAULT_ESTIMATE_VIEWPORT_WIDTH = 1024;

function getEstimateViewportWidth() {
  return typeof window !== "undefined" ? window.innerWidth : DEFAULT_ESTIMATE_VIEWPORT_WIDTH;
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
  markAsReadLocal,
  searchQuery,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 使用 ref 引用 messages，让 estimateSize / getItemKey 保持引用稳定
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ═══ TanStack Virtual 初始化 ═══════════════════════════════════════════════
  // estimateSize / getItemKey 使用 ref 而非闭包依赖 messages：
  // 避免 messages 引用变化时 virtualizer 重建缓存
  const estimateSize = useCallback(
    (index: number) => {
      const msg = messagesRef.current[index];
      const containerWidth = scrollRef.current
        ? scrollRef.current.clientWidth
        : (typeof window !== "undefined" ? Math.min(640, window.innerWidth) : 400);
      return msg
        ? estimateMessageItemHeight(msg, {
          containerWidth,
          viewportWidth: getEstimateViewportWidth(),
        })
        : 300;
    },
    [],
  );

  const getItemKey = useCallback(
    (index: number) => messagesRef.current[index]?.id ?? index,
    [],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: 8,
  });

  const isAtBottomRef = useMessageScrollEdges({
    scrollRef,
    enabled: !loading && messages.length > 0,
    hasOlder,
    hasNewer,
    loadingOlder,
    loadingNewer,
    onLoadOlder,
    onLoadNewer,
    onSetAtBottom,
  });

  const estimateCompensationHeight = useCallback(
    (message: Message) => estimateMessageItemHeight(message, {
      viewportWidth: getEstimateViewportWidth(),
    }),
    [],
  );

  useMessageScrollPositioning({
    messages,
    loading,
    anchorId,
    scrollRef,
    virtualizer,
    isAtBottomRef,
    estimateCompensationHeight,
  });

  useReadSyncOnVisibility({ messages, markAsReadLocal });

  // ═══ 骨架屏 ═══════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex h-full flex-col p-4 sm:p-6">
        <div className="mx-auto w-full max-w-[980px] space-y-3">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
        <p className="py-3 text-center text-sm text-muted-foreground">加载消息中...</p>
      </div>
    );
  }

  // ═══ 空状态 ═══════════════════════════════════════════════════════════════
  if (messages.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="mx-auto max-w-md border border-dashed border-border/70 bg-card/70 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-lg bg-muted">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <CardTitle>暂无消息</CardTitle>
            <CardDescription>
              添加过滤器来开始追踪 Telegram 消息，匹配的消息会出现在这里。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ═══ 主体：TanStack Virtual 虚拟列表 ═══════════════════════════════════════
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-0 pt-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-message-scroll
      >
        {/* ── 顶部指示器 ── */}
        {loadingOlder ? (
          <div className="mx-auto flex max-w-[980px] items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载历史消息...
          </div>
        ) : !hasOlder ? (
          <p className="mx-auto max-w-[980px] py-4 text-center text-sm text-muted-foreground">
            已加载全部历史消息
          </p>
        ) : (
          <div className="py-4" aria-hidden />
        )}

        {/* ── 虚拟列表容器 ── */}
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((vItem) => {
            const msg = messages[vItem.index];
            let diffElement = null;
            if (import.meta.env.DEV) {
              const containerWidth = scrollRef.current?.clientWidth || 400;
              const estHeight = estimateMessageItemHeight(msg, {
                containerWidth,
                viewportWidth: getEstimateViewportWidth(),
              });
              const realHeight = vItem.size;
              const diff = realHeight - estHeight;

              diffElement = (
                <div className="pointer-events-none absolute top-1 right-[max(1.5rem,calc((100%-980px)/2+1.5rem))] z-20 rounded-md bg-foreground/65 px-2 py-1 font-mono text-[10px] text-background/90 shadow-sm backdrop-blur-sm">
                  <span className={Math.abs(diff) > 20 ? "font-bold text-destructive" : "text-success"}>
                    Diff: {diff > 0 ? "+" : ""}{diff.toFixed(2)}px
                  </span>
                  <span className="ml-2 opacity-70">
                    Est {estHeight.toFixed(0)} / Real {realHeight.toFixed(0)}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vItem.start}px)`,
                }}
              >
                {diffElement}

                <div className="mx-auto w-full max-w-[980px] px-4 pb-4 sm:px-6">
                  <MessageCard
                    message={msg}
                    onToggleRead={onToggleRead}
                    searchQuery={searchQuery}
                    isAnchor={msg.id === anchorId}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 底部加载指示器 ── */}
        {loadingNewer && (
          <div className="mx-auto flex max-w-[980px] items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载新消息...
          </div>
        )}
      </div>

      {/* ── 新消息 badge ── */}
      {hasPendingNew && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <Button
            size="sm"
            variant="default"
            className="flex items-center gap-1.5 rounded-full px-4 shadow-lg"
            onClick={onFlushPending}
          >
            <ArrowDown className="size-3.5" />
            有新消息
          </Button>
        </div>
      )}
    </div>
  );
}
