import type { Message } from "../types";
import "./MessageCard.css";

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
    <div className={`message-card animate-fade-in ${message.isRead ? "is-read" : ""}`}>
      <div className="message-header">
        <div className="message-source">
          <span className="message-chat-icon">💬</span>
          <span className="message-chat-title">{message.chatTitle}</span>
          {message.filterName && (
            <span className="badge badge-keyword">{message.filterName}</span>
          )}
        </div>
        <div className="message-meta">
          <span className={`badge ${message.isRead ? "badge-read" : "badge-unread"}`}>
            {message.isRead ? "已读" : "未读"}
          </span>
          <span className="message-time">{timeAgo}</span>
        </div>
      </div>

      <div className="message-body">
        <div className="message-sender">
          <span className="sender-avatar">
            {message.senderName.charAt(0).toUpperCase()}
          </span>
          <span className="sender-name">{message.senderName}</span>
        </div>
        <p className="message-content">
          {highlightContent(message.content.slice(0, 500))}
          {message.content.length > 500 && <span className="text-muted">...</span>}
        </p>
      </div>

      <div className="message-footer">
        <div className="message-actions">
          <button
            className={`btn btn-sm action-btn like-btn ${message.isRead ? "liked" : ""}`}
            onClick={() => onToggleRead(message.id)}
            title={message.isRead ? "标记为未读" : "标记为已读"}
          >
            <span className="like-icon">{message.isRead ? "👍" : "👍🏻"}</span>
            <span>{message.isRead ? "已读" : "点赞"}</span>
          </button>

          {message.telegramLink && (
            <a
              href={message.telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-telegram action-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.484-.429-.008-1.252-.242-1.865-.442-.751-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141a.506.506 0 01.171.325c.016.093.036.306.02.472z"/>
              </svg>
              <span>查看原文</span>
            </a>
          )}
        </div>

        <span className="message-date">
          {new Date(message.messageDate).toLocaleString("zh-CN")}
        </span>
      </div>
    </div>
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
