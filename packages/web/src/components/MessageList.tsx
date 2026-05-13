import { useEffect, useRef } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCard } from "./MessageCard";
import type { Message } from "../types";

interface Props {
  messages: Message[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loading: boolean;
  onToggleRead: (id: number) => void;
  onLoadMore: () => void;
  searchQuery?: string;
  autoLocateEnabled?: boolean;
  autoLocateContextKey?: string;
}

function findAnchorUnreadIndex(messages: Message[]): number {
  if (messages.length === 0) return -1;

  // 列表按时间倒序：第一个已读可视为“最近已读”
  const nearestReadIndex = messages.findIndex((m) => m.isRead);
  if (nearestReadIndex === -1) {
    return messages.findIndex((m) => !m.isRead);
  }

  // 优先选择最近已读后面的未读（时间更早的一侧）
  if (nearestReadIndex + 1 < messages.length && !messages[nearestReadIndex + 1].isRead) {
    return nearestReadIndex + 1;
  }

  // 其次选择前面的未读
  if (nearestReadIndex - 1 >= 0 && !messages[nearestReadIndex - 1].isRead) {
    return nearestReadIndex - 1;
  }

  // 最后兜底为任意第一条未读
  return messages.findIndex((m) => !m.isRead);
}

export function MessageList({
  messages,
  hasMore,
  isLoadingMore,
  loading,
  onToggleRead,
  onLoadMore,
  searchQuery,
  autoLocateEnabled = true,
  autoLocateContextKey,
}: Props) {
  // 哨兵元素：进入视口时触发加载下一页
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  // 首次加载完成后，定位到第一条未读消息
  const scrolledToUnreadRef = useRef(false);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoLocateEnabled) {
      return;
    }

    if (!loading && !scrolledToUnreadRef.current && firstUnreadRef.current) {
      scrolledToUnreadRef.current = true;
      firstUnreadRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, autoLocateEnabled]);

  // 过滤条件变化时重置"已滚动"标记（通过 messages 引用变化感知）
  useEffect(() => {
    scrolledToUnreadRef.current = false;
    firstUnreadRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, autoLocateContextKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
        <p className="text-center text-sm text-muted-foreground">加载消息中...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card className="mx-auto max-w-xl border border-dashed border-border/70 bg-card/60 text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="size-5 text-muted-foreground" />
          </div>
          <CardTitle>暂无消息</CardTitle>
          <CardDescription>添加过滤器来开始追踪 Telegram 消息，匹配的消息会出现在这里。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // 找出“最近已读相邻”的未读消息索引
  const anchorUnreadIndex = findAnchorUnreadIndex(messages);

  return (
    <div className="space-y-3">
      {messages.map((msg, index) => (
        <div
          key={msg.id}
          ref={(el) => {
            // 捕获第一条未读消息的 DOM 节点
            if (autoLocateEnabled && index === anchorUnreadIndex && !scrolledToUnreadRef.current) {
              firstUnreadRef.current = el;
            }
          }}
        >
          <MessageCard message={msg} onToggleRead={onToggleRead} searchQuery={searchQuery} />
        </div>
      ))}

      {/* 加载哨兵：进入视口自动加载更多 */}
      <div ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载更多...
        </div>
      )}

      {!hasMore && messages.length > 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">已加载全部消息</p>
      )}
    </div>
  );
}
