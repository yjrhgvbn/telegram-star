import { CheckCircle2, Clock3, ExternalLink, KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
        "relative overflow-visible bg-card/82 transition-colors hover:bg-card",
        !message.isRead && "border-primary/28 bg-card",
        message.isRead && "text-foreground/88",
        isAnchor && "border-primary shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_12%,transparent)]",
      )}
    >
      <CardHeader className="px-3 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                message.isRead ? "bg-muted-foreground/28" : "bg-primary",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <CardTitle className="min-w-0 truncate text-sm leading-tight">{message.chatTitle}</CardTitle>
                {mediaLabel && (
                  <Badge variant="outline">
                    {mediaLabel}
                  </Badge>
                )}
                {message.matchedKeyword && (
                  <Badge variant="secondary">
                    <KeyRound data-icon="inline-start" />
                    {message.matchedKeyword}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="max-w-48 truncate font-medium text-foreground/72">{message.senderName}</span>
                <span className="inline-flex items-center gap-1" title={exactTime}>
                  <Clock3 className="size-3" />
                  {timeAgo}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            {message.isRead ? (
              <Badge variant="ghost">
                <CheckCircle2 data-icon="inline-start" />
                已读
              </Badge>
            ) : (
              <Badge>未读</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 px-3 pb-3">
        {content.length > 0 && (
          <p className="whitespace-pre-wrap break-words text-sm leading-5.5 text-foreground/90">
            {renderHighlightedContent(contentPreview, searchQuery)}
            {hasTruncatedContent && <span className="text-muted-foreground">...</span>}
          </p>
        )}

        <MediaPreview message={message} />

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={message.isRead ? "ghost" : "secondary"}
            size="sm"
            onClick={() => onToggleRead(message.id)}
            title={message.isRead ? "标记为未读" : "标记为已读"}
          >
            {message.isRead ? "恢复未读" : "标记已读"}
          </Button>

          {message.telegramLink && (
            <a
              href={message.telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              onClick={(event) =>
                handleExternalLink(event, message.telegramLink, () =>
                  sessionStorage.setItem("telegram_jump_msg_id", message.id.toString()),
                )
              }
            >
              查看原文
              <ExternalLink data-icon="inline-end" />
            </a>
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
