/** Telegram 会话（群组/频道）基础信息 */
export interface JoinedChat {
  id: string;
  title: string;
}

/** 实时捕获或从历史拉取的单条消息 */
export interface LiveChatMessage {
  id: number;
  chatId: string;
  chatTitle: string;
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
  /** 该消息是否已在数据库中存在 */
  inDatabase: boolean;
  // --- 媒体元信息 ---
  mediaType: string | null;
  mediaFileName: string | null;
  mediaFileSize: number | null;
  mediaMimeType: string | null;
  mediaDuration: number | null;
  mediaThumbBase64: string | null;
  mediaExtra: string | null;
}

/** 历史扫描预览消息，附带匹配的关键词 */
export interface HistoricalFilterPreviewMessage extends LiveChatMessage {
  matchedKeyword: string | null;
}
