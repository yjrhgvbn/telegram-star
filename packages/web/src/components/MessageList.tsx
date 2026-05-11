import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCard } from "./MessageCard";
import type { Message, MessagePagination } from "../types";

interface Props {
  messages: Message[];
  pagination: MessagePagination;
  loading: boolean;
  onToggleRead: (id: number) => void;
  onPageChange: (page: number) => void;
  searchQuery?: string;
}

export function MessageList({ messages, pagination, loading, onToggleRead, onPageChange, searchQuery }: Props) {
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

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.map((msg) => (
          <div key={msg.id}>
            <MessageCard message={msg} onToggleRead={onToggleRead} searchQuery={searchQuery} />
          </div>
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <Card className="bg-card/70">
          <CardContent className="flex items-center justify-center gap-3 py-3">
            <Button variant="ghost" size="sm" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
              ← 上一页
            </Button>
            <Badge variant="secondary" className="rounded-full px-3">
              {pagination.page} / {pagination.totalPages}
            </Badge>
            <Button variant="ghost" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>
              下一页 →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
