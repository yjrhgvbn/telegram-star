import { ExternalLink, MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Message } from "../types";

interface Props {
  message: Message;
  onToggleRead: (id: number) => void;
  searchQuery?: string;
}

export function MessageCard({ message, onToggleRead, searchQuery }: Props) {
  const timeAgo = getTimeAgo(message.messageDate);

  // Highlight matched keyword in content
  const highlightContent = (text: string) => {
    const keyword = message.matchedKeyword || searchQuery;
    if (!keyword) return text;

    const parts = text.split(new RegExp(`(${escapeRegex(keyword)})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === keyword.toLowerCase() ? (
        <mark key={i} className="highlight">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <Card
      className={cn(
        "border border-border/70 bg-card/75 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        !message.isRead && "ring-1 ring-primary/20",
        message.isRead && "opacity-80"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <MessagesSquare className="size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">{message.chatTitle}</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{timeAgo}</span>
                <span>·</span>
                <span>{new Date(message.messageDate).toLocaleString("zh-CN")}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {message.filterName && (
              <Badge variant="secondary" className="max-w-30 truncate">{message.filterName}</Badge>
            )}
            <Badge variant={message.isRead ? "outline" : "default"}>
              {message.isRead ? "已读" : "未读"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-linear-to-br from-sky-500/80 to-emerald-500/80 text-xs font-semibold text-white">
            {message.senderName.charAt(0).toUpperCase()}
          </span>
          <span className="text-sm text-muted-foreground">{message.senderName}</span>
        </div>

        <p className="text-sm leading-7 text-foreground/95">
          {highlightContent(message.content.slice(0, 500))}
          {message.content.length > 500 && <span className="text-muted-foreground">...</span>}
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant={message.isRead ? "secondary" : "outline"}
            size="sm"
            onClick={() => onToggleRead(message.id)}
            title={message.isRead ? "标记为未读" : "标记为已读"}
          >
            {message.isRead ? "标记未读" : "标记已读"}
          </Button>

          {message.telegramLink && (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<a href={message.telegramLink} target="_blank" rel="noopener noreferrer" />}
            >
              查看原文
              <ExternalLink data-icon="inline-end" />
            </Button>
          )}
        </div>
      </CardContent>

      <CardFooter className="justify-end border-t border-border/70 bg-muted/30 py-2 text-xs text-muted-foreground">
        消息 ID #{message.id}
      </CardFooter>
    </Card>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}
