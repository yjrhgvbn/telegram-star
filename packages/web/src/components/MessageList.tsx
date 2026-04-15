import { MessageCard } from "./MessageCard";
import type { Message, MessagePagination } from "../types";
import "./MessageList.css";

interface Props {
  messages: Message[];
  pagination: MessagePagination;
  loading: boolean;
  onToggleRead: (id: number) => void;
  onPageChange: (page: number) => void;
  searchQuery?: string;
}

export function MessageList({
  messages,
  pagination,
  loading,
  onToggleRead,
  onPageChange,
  searchQuery,
}: Props) {
  if (loading) {
    return (
      <div className="message-list-loading">
        <div className="spinner" />
        <p>加载消息中...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <h3 className="empty-state-title">暂无消息</h3>
        <p className="empty-state-text">
          添加过滤器来开始追踪 Telegram 消息，匹配的消息会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="message-list">
      <div className="message-list-items">
        {messages.map((msg, index) => (
          <div key={msg.id} style={{ animationDelay: `${index * 30}ms` }}>
            <MessageCard
              message={msg}
              onToggleRead={onToggleRead}
              searchQuery={searchQuery}
            />
          </div>
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-ghost btn-sm"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            ← 上一页
          </button>
          <div className="pagination-info">
            <span className="pagination-current">{pagination.page}</span>
            <span className="pagination-sep">/</span>
            <span>{pagination.totalPages}</span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}
