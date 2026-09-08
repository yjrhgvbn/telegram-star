import { useId, useMemo, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Copy, Ellipsis, ExternalLink, Link, LoaderCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClientExternalLink } from "@/shared/runtime/ClientShellBridgeProvider";
import { getMessageContentPreview } from "../utils/messageContentPreview";
import { rememberTelegramJumpMessageId } from "../utils/messageNavigation";
import { MediaPreview } from "./MediaPreview";
import { MessageContent } from "./MessageContent";
import { MessageSourceAvatar } from "./MessageSourceAvatar";
import type { Message, MessageContentLink } from "@/types";
import "./MessageCard.css";

const EMPTY_LINKS: MessageContentLink[] = [];
const MESSAGE_TIME_FORMAT = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

interface Props {
  message: Message;
  onToggleRead: (id: number) => void;
  onOpenTelegram?: (id: number) => void;
  searchQuery?: string;
  /** 自动定位只提示当前位置，不改变完成状态。 */
  isAnchor?: boolean;
  isSelecting?: boolean;
  isSelected?: boolean;
  onSelect?: (id: number) => void;
  isReadPending?: boolean;
  completionDisabled?: boolean;
}

export function MessageCard({
  message, onToggleRead, onOpenTelegram, searchQuery, isAnchor,
  isSelecting = false, isSelected = false, onSelect, isReadPending = false, completionDisabled = false,
}: Props) {
  const handleExternalLink = useClientExternalLink();
  const bodyId = useId();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const links = message.contentLinks ?? EMPTY_LINKS;
  const preview = useMemo(() => getMessageContentPreview(message.content, links), [message.content, links]);
  const expanded = expandedId === message.id;
  const isVideo = message.mediaType === "video" || message.mediaType === "videoNote";
  const completionLabel = message.isRead ? (isVideo ? "已看完" : "已完成") : (isVideo ? "标记看完" : "标记完成");
  const statusLabel = message.isRead ? (isVideo ? "已看完" : "已完成") : (isVideo ? "待看完" : "待完成");
  const date = new Date(message.messageDate);
  const validDate = Number.isFinite(date.getTime());
  const source = message.chatTitle || message.senderName || "Telegram";
  const hasMedia = Boolean(message.mediaType);
  const visualMedia = ["photo", "video", "videoNote", "gif"].includes(message.mediaType || "");

  async function copyText(text: string, success: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyFeedback(success);
    } catch {
      setCopyFeedback("复制未成功，请选中文字后手动复制。");
    }
  }

  return (
    <article
      data-read-state={message.isRead ? "read" : "unread"}
      data-anchor={isAnchor ? "true" : undefined}
      data-selected={isSelected ? "true" : undefined}
      className="message-card"
      aria-label={`${source}的消息`}
    >
      <div className="message-card__leading">
        {isSelecting ? (
          <label className="message-card__selection">
            <input type="checkbox" checked={isSelected} onChange={() => onSelect?.(message.id)} aria-label={`选择 ${source} 的消息`} />
          </label>
        ) : (
          <MessageSourceAvatar messageId={message.id} source={source} />
        )}
      </div>
      <div className="message-card__main">
        <header className="message-card__header">
          <div className="message-card__identity">
            <span className="message-card__source" title={source}>{source}</span>
            <span className="message-card__status">
              {message.isRead ? <CheckCircle2 aria-hidden="true" /> : null}
              {statusLabel}
            </span>
          </div>
          <time className="message-card__time" dateTime={validDate ? message.messageDate : undefined} title={validDate ? date.toLocaleString("zh-CN") : undefined}>
            {validDate ? MESSAGE_TIME_FORMAT.format(date) : "时间未知"}
          </time>
          <Menu.Root>
            <Menu.Trigger render={<Button variant="ghost" size="icon-lg" className="message-card__more" aria-label="更多消息操作" />}>
              <Ellipsis />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="end" className="message-theme">
                <Menu.Popup className="message-theme message-card-menu">
                  <Menu.Group>
                    <Menu.Item className="message-card-menu__item" disabled={!message.content.trim()} onClick={() => void copyText(message.content, "消息文字已复制")}>
                      <Copy aria-hidden="true" />复制消息
                    </Menu.Item>
                    <Menu.Item className="message-card-menu__item" disabled={!message.telegramLink} onClick={() => void copyText(message.telegramLink, "原文链接已复制")}>
                      <Link aria-hidden="true" />{message.telegramLink ? "复制原文链接" : "无原文链接"}
                    </Menu.Item>
                  </Menu.Group>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          {message.senderName && message.senderName !== source ? <span className="message-card__sender">{message.senderName}</span> : null}
        </header>
        <div className={cn("message-card__content", visualMedia && "message-card__content--visual")}>
          {message.content.trim() ? (
            <div className="message-card__text">
              <p id={bodyId} className="message-card__body">
                <MessageContent content={expanded ? message.content : preview.text} links={links} searchQuery={searchQuery} mediaFileName={message.mediaFileName} />
                {!expanded && preview.truncated ? <span className="message-card__ellipsis">…</span> : null}
              </p>
              {preview.truncated ? (
                <Button variant="ghost" size="sm" className="message-card__expand" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpandedId(expanded ? null : message.id)}>
                  {expanded ? "收起原文" : "展开原文"}
                  {expanded ? <ChevronUp data-icon="inline-end" /> : <ChevronDown data-icon="inline-end" />}
                </Button>
              ) : null}
            </div>
          ) : null}
          {hasMedia ? <div className="message-card__media"><MediaPreview message={message} onOpenTelegram={onOpenTelegram} /></div> : null}
        </div>
        {/* Completion belongs after the actual content and attachments. Neither
            Telegram links nor media previews call onToggleRead. */}
        <div className="message-card__actions">
          <Button
            variant="ghost"
            size="lg"
            className="message-card__action message-card__complete"
            disabled={isReadPending || completionDisabled}
            aria-pressed={message.isRead}
            onClick={() => onToggleRead(message.id)}
            title={message.isRead ? "恢复为待完成" : `${isVideo ? "看完" : "处理完"}后标记；你在 Telegram 添加的表情反馈也会同步完成`}
          >
            {isReadPending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : message.isRead ? <CheckCircle2 data-icon="inline-start" className="message-card__complete-icon" /> : <Circle data-icon="inline-start" />}
            {isReadPending ? "保存中" : completionLabel}
          </Button>
          {message.telegramLink ? (
            <a
              href={message.telegramLink} target="_blank" rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "message-card__action")}
              onClick={event => handleExternalLink(event, message.telegramLink, () => {
                rememberTelegramJumpMessageId(message.id);
                onOpenTelegram?.(message.id);
              })}
            >
              <ExternalLink data-icon="inline-start" />在 Telegram 打开
            </a>
          ) : null}
        </div>
        {copyFeedback ? <p className="message-card__feedback" role="status">{copyFeedback}</p> : null}
      </div>
    </article>
  );
}
