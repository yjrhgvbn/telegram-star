import { useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Inbox, Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageCard } from "./MessageCard";
import type { Message } from "@/types";

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

/**
 * 根据消息内容长度估算单条卡片的渲染高度。
 *
 * 与 react-virtuoso 只有一个全局 `defaultItemHeight` 不同，
 * @tanstack/react-virtual 的 `estimateSize` 支持 per-item 估算，
 * 能将高度误差从 ±450px 降至 ±30px，几乎消除 scroll 补偿时的视觉抖动。
 */
import { prepareWithSegments, measureLineStats } from "@chenglou/pretext";

function estimateItemHeight(message: Message, containerWidth: number = 400): number {

  // 外围和固定元素的基础高度：
  const FIXED_BASE = 199;
  let height = FIXED_BASE;

  // 统一计算可用宽度（完美对齐浏览器亚像素）：
  // 屏幕 < 640px 时: 外层 px-4(32) + MessageCard border(2) + CardContent px-4(32) = 66px
  // 屏幕 >= 640px 时: 外层 sm:px-6(48) + MessageCard border(2) + CardContent px-4(32) = 82px
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const paddingH = screenW < 640 ? 66 : 82;
  const availableWidth = Math.max(100, containerWidth - paddingH);

  // CardContent 内部的组件数量，用于计算 space-y-3 (12px) 的数量
  // Sender 和 Buttons 这 2 个是一直都在的
  let itemsCount = 2;

  // 1. 媒体部分高度估算
  if (message.mediaType) {
    itemsCount++;
    let mediaH = 54; // 默认细长组件的高度
    switch (message.mediaType) {
      case "photo":
      case "video":
      case "videoNote":
      case "gif": {
        mediaH = 280; // 默认高度
        if (message.mediaExtra) {
          try {
            const extra = JSON.parse(message.mediaExtra);
            if (extra.w && extra.h) {
              mediaH = Math.min(450, (availableWidth * extra.h) / extra.w);
            }
          } catch {
            // ignore
          }
        }
        break;
      }
      case "sticker":
        mediaH = 160; // index.css 中写死的 max-height: 160px
        break;
      case "document":
      case "audio":
      case "voice":
      case "contact":
      case "geo":
      case "poll":
        mediaH = 54; // paddings 16px + icon/text ~38px
        break;
    }
    height += mediaH;
  }

  // 2. 文字部分高度估算
  const textStr = message.content.trim();
  if (textStr.length > 0) {
    itemsCount++;
    const textToMeasure = textStr.slice(0, 500) + (textStr.length > 500 ? "..." : "");

    // Telegram 消息通常包含换行符 (\n)，pretext 不会自动处理多段落的硬换行，
    // 所以必须将文本按换行符拆分，对每一段单独测量并累加行数。
    const paragraphs = textToMeasure.split('\n');
    let totalLines = 0;

    for (const p of paragraphs) {
      if (p.length === 0) {
        totalLines += 1; // 空换行也占一行高度
        continue;
      }
      // 注意：必须和 index.css 的全局字体栈保持像素级一致
      const prepared = prepareWithSegments(p, '14px "Geist Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"');
      const stats = measureLineStats(prepared, availableWidth);
      totalLines += Math.max(1, stats.lineCount);
    }

    // Tailwind leading-7 对应 line-height: 28px
    height += totalLines * 28;
  }

  // 加上所有子元素之间的 gap
  height += (itemsCount - 1) * 12;

  return height;
}

const EDGE_THRESHOLD = 300;      // 距离边缘多少 px 触发加载
const AT_BOTTOM_THRESHOLD = 300; // 距底部多少 px 视为"在底部"

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
      return msg ? estimateItemHeight(msg, containerWidth) : 300;
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

  // ═══ Prepend scroll 补偿 ═══════════════════════════════════════════════════
  // 核心改进：通过 useLayoutEffect（同步、paint 前）修正 scrollTop，
  // 而非 react-virtuoso 的 React state 异步修正（下一帧才生效 → 抖动根因）。
  const prevFirstIdRef = useRef<number | undefined>(undefined);
  const compensateRef = useRef(0);
  const prevLoadingRef = useRef(loading);

  // loading 切为 true 时重置追踪
  if (loading && !prevLoadingRef.current) {
    prevFirstIdRef.current = undefined;
  }
  prevLoadingRef.current = loading;

  // 渲染阶段同步检测 prepend → 计算补偿高度
  if (!loading && messages.length > 0) {
    const curFirstId = messages[0].id;
    if (prevFirstIdRef.current !== undefined && curFirstId !== prevFirstIdRef.current) {
      const oldIdx = messages.findIndex((m) => m.id === prevFirstIdRef.current);
      if (oldIdx > 0) {
        let h = 0;
        for (let i = 0; i < oldIdx; i++) h += estimateItemHeight(messages[i]);
        compensateRef.current = h;
      }
    }
    prevFirstIdRef.current = curFirstId;
  }

  // 在浏览器 paint 之前同步修正 scrollTop —— 用户看不到中间态
  useLayoutEffect(() => {
    if (compensateRef.current > 0 && scrollRef.current) {
      scrollRef.current.scrollTop += compensateRef.current;
      compensateRef.current = 0;
    }
  });

  // ═══ 初始滚动（loading 结束后执行一次）════════════════════════════════════
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (loading) {
      hasScrolledRef.current = false;
      return;
    }
    if (hasScrolledRef.current || messages.length === 0) return;
    hasScrolledRef.current = true;

    requestAnimationFrame(() => {
      const idx =
        anchorId !== null ? messages.findIndex((m) => m.id === anchorId) : -1;
      if (idx >= 0) {
        virtualizer.scrollToIndex(idx, { align: "center" });
      } else {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      }
    });
  }, [loading, anchorId, messages.length, virtualizer]);

  // ═══ Scroll 事件：边缘检测 + atBottom 追踪 ═════════════════════════════════
  const hasOlderRef = useRef(hasOlder);
  hasOlderRef.current = hasOlder;
  const loadingOlderRef = useRef(loadingOlder);
  loadingOlderRef.current = loadingOlder;
  const hasNewerRef = useRef(hasNewer);
  hasNewerRef.current = hasNewer;
  const loadingNewerRef = useRef(loadingNewer);
  loadingNewerRef.current = loadingNewer;
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;

      // 顶部 → 加载更旧
      if (scrollTop <= EDGE_THRESHOLD && hasOlderRef.current && !loadingOlderRef.current) {
        onLoadOlder();
      }

      // 底部 → 加载更新
      const gap = scrollHeight - scrollTop - clientHeight;
      if (gap <= EDGE_THRESHOLD && hasNewerRef.current && !loadingNewerRef.current) {
        onLoadNewer();
      }

      // atBottom 状态
      const atBottom = gap < AT_BOTTOM_THRESHOLD;
      isAtBottomRef.current = atBottom;
      onSetAtBottom(atBottom);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onLoadOlder, onLoadNewer, onSetAtBottom]);

  // ═══ Follow output：新消息追加时自动滚到底部 ════════════════════════════════
  const prevLastIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1].id;
    if (
      prevLastIdRef.current !== undefined &&
      lastId !== prevLastIdRef.current &&
      isAtBottomRef.current
    ) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      });
    }
    prevLastIdRef.current = lastId;
  }, [messages, virtualizer]);

  // ═══ 骨架屏 ═══════════════════════════════════════════════════════════════
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

  // ═══ 空状态 ═══════════════════════════════════════════════════════════════
  if (messages.length === 0) {
    return (
      <div className="p-4">
        <Card className="mx-auto border border-dashed border-border/70 bg-card/60 text-center">
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

  // ═══ 主体：TanStack Virtual 虚拟列表 ═══════════════════════════════════════
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative h-full w-full">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {/* ── 顶部指示器 ── */}
        {loadingOlder ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载历史消息...
          </div>
        ) : !hasOlder ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
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
            // 调试用：计算实时预估高度与真实渲染高度的差异 (仅在开发环境运行)
            let diffElement = null;
            if (import.meta.env.DEV) {
              const containerWidth = scrollRef.current?.clientWidth || 400;
              const estHeight = estimateItemHeight(msg, containerWidth);
              const realHeight = vItem.size;
              const diff = realHeight - estHeight; // 不要 round，保留真实小数看极细微偏差

              diffElement = (
                <div className="pointer-events-none absolute right-8 top-1 z-50 rounded bg-black/80 px-2 py-1 font-mono text-[10px] text-white/90 opacity-60 backdrop-blur-sm transition-opacity hover:opacity-100 sm:right-10">
                  <span className={Math.abs(diff) > 20 ? "font-bold text-red-400" : "text-green-400"}>
                    Diff: {diff > 0 ? "+" : ""}{diff.toFixed(2)}px
                  </span>
                  <span className="ml-2 text-white/60">
                    (Est: {estHeight.toFixed(2)} / Real: {realHeight.toFixed(2)})
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
                {/* ── 高度计算调试面板 (开发用，打包时由于 import.meta.env.DEV 为 false 会被剔除) ── */}
                {diffElement}

                <div className="px-4 pb-3 sm:px-6">
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
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
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
