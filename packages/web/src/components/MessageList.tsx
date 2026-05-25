import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ArrowDown, Inbox, Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageCard } from "./MessageCard";
import type { Message } from "../types";

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
  searchQuery?: string;
}

/** Virtuoso context 类型，用于传递动态状态给 Header/Footer */
interface VirtuosoCtx {
  loadingOlder: boolean;
  hasOlder: boolean;
  loadingNewer: boolean;
}

/** 顶部 Header：已加载全部历史 / 加载中 */
const VirtuosoHeader: React.FC<{ context?: VirtuosoCtx }> = ({ context }) => {
  if (context?.loadingOlder) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载历史消息...
      </div>
    );
  }
  if (context && !context.hasOlder) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        已加载全部历史消息
      </p>
    );
  }
  return null;
};

/** 底部 Footer：加载新消息中 */
const VirtuosoFooter: React.FC<{ context?: VirtuosoCtx }> = ({ context }) => {
  if (!context?.loadingNewer) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      加载新消息...
    </div>
  );
};

/** 稳定的 components 对象引用，避免 Virtuoso 因 inline 对象导致不必要的重挂载 */
const VIRTUOSO_COMPONENTS = {
  Header: VirtuosoHeader,
  Footer: VirtuosoFooter,
} as const;

/**
 * firstItemIndex 的初始值。设置较大值，
 * 向前加载时通过减少该值来 prepend 消息，Virtuoso 自动维护滚动位置。
 */
const START_INDEX = 100_000;

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
  searchQuery,
}: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // ─── firstItemIndex：Virtuoso 双向滚动核心状态 ────────────────────────────
  // 初始值 START_INDEX；每次 prepend N 条消息时减 N，Virtuoso 自动保持滚动位置
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  /** 上次渲染时第一条消息的 id，用于检测 prepend */
  const prevFirstIdRef = useRef<number | undefined>(undefined);

  // 新的数据加载（loading=true）时重置
  useEffect(() => {
    if (loading) {
      setFirstItemIndex(START_INDEX);
      prevFirstIdRef.current = undefined;
    }
  }, [loading]);

  // 检测 prepend：messages[0] 变化 → 计算新增条数 → 更新 firstItemIndex
  useEffect(() => {
    if (messages.length === 0) return;
    const currentFirstId = messages[0].id;

    if (prevFirstIdRef.current !== undefined && prevFirstIdRef.current !== currentFirstId) {
      const oldFirstIdx = messages.findIndex((m) => m.id === prevFirstIdRef.current);
      if (oldFirstIdx > 0) {
        setFirstItemIndex((idx) => idx - oldFirstIdx);
      }
    }
    prevFirstIdRef.current = currentFirstId;
  }, [messages]);

  // ─── 初始滚动（loading 结束后执行一次）──────────────────────────────────────
  const hasScrolledInitially = useRef(false);
  useEffect(() => {
    if (loading) {
      hasScrolledInitially.current = false;
      return;
    }
    if (hasScrolledInitially.current || messages.length === 0) return;
    hasScrolledInitially.current = true;

    // 等待 Virtuoso 完成首次布局后再滚动
    requestAnimationFrame(() => {
      const anchorIndex =
        anchorId !== null ? messages.findIndex((m) => m.id === anchorId) : -1;

      if (anchorIndex >= 0) {
        // 有锚点：滚到锚点消息居中（align: center）
        virtuosoRef.current?.scrollToIndex({
          index: anchorIndex,
          align: "center",
          behavior: "auto",
        });
      } else {
        // 无锚点：滚到底部（类聊天默认行为）
        virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
      }
    });
  }, [loading, anchorId, messages.length]);

  // ─── startReached：用户滚到顶部，加载更旧消息 ────────────────────────────
  // 用 ref 防止 loadingOlder 状态更新前重复触发
  const loadingOlderRef = useRef(loadingOlder);
  loadingOlderRef.current = loadingOlder;
  const hasOlderRef = useRef(hasOlder);
  hasOlderRef.current = hasOlder;

  const startReached = useCallback(() => {
    if (!hasOlderRef.current || loadingOlderRef.current) return;
    onLoadOlder();
  }, [onLoadOlder]);

  // ─── endReached：用户滚到底部，加载更新消息（非 SSE 情况）──────────────────
  const hasNewerRef = useRef(hasNewer);
  hasNewerRef.current = hasNewer;
  const loadingNewerRef = useRef(loadingNewer);
  loadingNewerRef.current = loadingNewer;

  const endReached = useCallback(() => {
    if (!hasNewerRef.current || loadingNewerRef.current) return;
    onLoadNewer();
  }, [onLoadNewer]);

  // ─── Virtuoso context（传递给 Header/Footer）────────────────────────────
  const virtuosoContext = useMemo<VirtuosoCtx>(
    () => ({ loadingOlder, hasOlder, loadingNewer }),
    [loadingOlder, hasOlder, loadingNewer],
  );

  // ─── itemContent：渲染单条消息 ───────────────────────────────────────────
  const itemContent = useCallback(
    (_index: number, msg: Message) => (
      <div className="px-4 pb-3 sm:px-6">
        <MessageCard
          message={msg}
          onToggleRead={onToggleRead}
          searchQuery={searchQuery}
          isAnchor={msg.id === anchorId}
        />
      </div>
    ),
    [onToggleRead, searchQuery, anchorId],
  );

  // ─── 骨架屏 ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full flex-col p-4 sm:p-6">
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
        <p className="py-3 text-center text-sm text-muted-foreground">加载消息中...</p>
      </div>
    );
  }

  // ─── 空状态 ────────────────────────────────────────────────────────────────
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="mx-auto max-w-xl border border-dashed border-border/70 bg-card/60 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
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

  // ─── 主体：Virtuoso 虚拟化列表 ─────────────────────────────────────────────
  return (
    <div className="relative h-full w-full">
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: "100%" }}
        data={messages}
        firstItemIndex={firstItemIndex}
        startReached={startReached}
        endReached={endReached}
        /**
         * followOutput={true}：只要 data 末尾追加了新条目，Virtuoso 就自动滚到底部。
         * Hook 只在用户在底部（或 flushPending）时才 append，因此此行为是安全的。
         */
        followOutput={true}
        atBottomStateChange={onSetAtBottom}
        context={virtuosoContext}
        components={VIRTUOSO_COMPONENTS}
        itemContent={itemContent}
      />

      {/* 新消息 badge：SSE 推送但用户不在底部时显示 */}
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
