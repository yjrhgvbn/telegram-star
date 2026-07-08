import { CheckCircle2, Clock3, ExternalLink, KeyRound, MessageSquareText } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClientExternalLink } from "@/shared/runtime/ClientShellBridgeProvider";
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
  const handleExternalLink = useClientExternalLink();
  const timeAgo = getTimeAgo(message.messageDate);
  const exactTime = new Date(message.messageDate).toLocaleString("zh-CN");
  const content = message.content.trim();
  const contentPreview = content.slice(0, 360);
  const hasTruncatedContent = content.length > 360;
  const mediaLabel = getMediaLabel(message.mediaType);

  return (
    <Card
      size="sm"
      className={cn(
        "relative overflow-visible border-transparent bg-card/88 shadow-sm ring-1 ring-border/16 transition-all duration-200 hover:bg-card/96 hover:shadow-md hover:ring-primary/18",
        !message.isRead && "bg-card/98 ring-primary/20",
        message.isRead && "bg-card/74",
        isAnchor && "shadow-md ring-2 ring-primary/24"
      )}
    >
      {!message.isRead && <span className="absolute top-3 left-0 h-10 w-1 rounded-r-full bg-primary shadow-[0_0_16px_color-mix(in_oklab,var(--primary)_36%,transparent)]" aria-hidden />}

      <CardHeader className="px-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md shadow-sm ring-1 ring-border/25",
              message.isRead ? "bg-muted/50 text-muted-foreground" : "bg-primary/12 text-primary",
            )}>
              <MessageSquareText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <CardTitle className="min-w-0 truncate text-[0.95rem] leading-tight">{message.chatTitle}</CardTitle>
                {mediaLabel && (
                  <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {mediaLabel}
                  </span>
                )}
                {message.matchedKeyword && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-warning/24 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
                    <KeyRound className="size-3" />
                    {message.matchedKeyword}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="max-w-40 truncate font-medium text-foreground/72">{message.senderName}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3" />
                  {timeAgo}
                </span>
                <span className="text-muted-foreground/72">{exactTime}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {message.isRead ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground/75">
                <CheckCircle2 className="size-3.5" />
                已读
              </span>
            ) : (
              <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">未读</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5 px-4 pb-4">
        {content.length > 0 && (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
            {renderHighlightedContent(contentPreview, searchQuery)}
            {hasTruncatedContent && <span className="text-muted-foreground">...</span>}
          </p>
        )}

        <MediaPreview message={message} />

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
              render={
                <a
                  href={message.telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) =>
                    handleExternalLink(event, message.telegramLink, () =>
                      sessionStorage.setItem("telegram_jump_msg_id", message.id.toString()),
                    )
                  }
                />
              }
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

function getMediaLabel(mediaType: string | null): string | null {
  switch (mediaType) {
    case "photo":
      return "图片";
    case "video":
    case "videoNote":
      return "视频";
    case "gif":
      return "GIF";
    case "sticker":
      return "贴纸";
    case "document":
      return "文件";
    case "voice":
      return "语音";
    case "audio":
      return "音频";
    case "contact":
      return "联系人";
    case "geo":
      return "位置";
    case "poll":
      return "投票";
    default:
      return mediaType;
  }
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
