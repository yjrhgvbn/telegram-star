import { CheckCircle2, ExternalLink, MessageSquareText } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MediaPreview } from "./MediaPreview";
import type { Message } from "@/types";

interface Props {
  message: Message;
  onToggleRead: (id: number) => void;
  searchQuery?: string;
  /** 是否为自动定位锚点，高亮显示边框以提示用户当前位置 */
  isAnchor?: boolean;
}

export function MessageCard({ message, onToggleRead, searchQuery, isAnchor }: Props) {
  const timeAgo = getTimeAgo(message.messageDate);

  return (
    <Card
      className={cn(
        "relative overflow-visible border-transparent bg-card/88 shadow-sm ring-1 ring-border/18 transition-all duration-200 hover:bg-card/96 hover:shadow-md hover:ring-primary/18",
        !message.isRead && "bg-card/96 ring-primary/18",
        message.isRead && "bg-card/72",
        isAnchor && "shadow-md ring-2 ring-primary/20"
      )}
    >
      {!message.isRead && <span className="absolute top-4 left-0 h-8 w-1 rounded-r-full bg-primary shadow-[0_0_16px_color-mix(in_oklab,var(--primary)_36%,transparent)]" aria-hidden />}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md shadow-sm ring-1 ring-border/25",
              message.isRead ? "bg-muted/50 text-muted-foreground" : "bg-primary/10 text-primary",
            )}>
              <MessageSquareText className="size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-[0.95rem]">{message.chatTitle}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">{message.senderName}</span>
                <span>·</span>
                <span>{timeAgo}</span>
                <span>·</span>
                <span>{new Date(message.messageDate).toLocaleString("zh-CN")}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {message.isRead ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground/82">
                <CheckCircle2 className="size-3.5" />
                已读
              </span>
            ) : (
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">未读</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <MediaPreview message={message} />

        {message.content.trim().length > 0 && (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
            {renderHighlightedContent(message.content.slice(0, 500), searchQuery)}
            {message.content.length > 500 && <span className="text-muted-foreground">...</span>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant={message.isRead ? "outline" : "default"}
            size="sm"
            onClick={() => onToggleRead(message.id)}
            title={message.isRead ? "标记为未读" : "标记为已读"}
          >
            {message.isRead ? "恢复未读" : "标记已读"}
          </Button>

          {message.telegramLink && (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<a href={message.telegramLink} target="_blank" rel="noopener noreferrer" onClick={() => sessionStorage.setItem("telegram_jump_msg_id", message.id.toString())} />}
            >
              查看原文
              <ExternalLink data-icon="inline-end" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedContent(content: string, searchQuery?: string): ReactNode {
  const query = searchQuery?.trim();
  if (!query) return content;

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  return content.split(regex).map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  );
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
