export type FilterConditionType = "keyword" | "chat";

export interface FilterCondition {
  type: FilterConditionType;
  values: string[];
}

export interface Filter {
  id: number;
  name: string;
  conditions: FilterCondition[];
  enabled: boolean;
  autoLocateUnreadNearRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JoinedChat {
  id: string;
  title: string;
}

export interface Message {
  id: number;
  telegramMessageId: number;
  chatId: string;
  chatTitle: string;
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
  isRead: boolean;
  matchedFilterId: number | null;
  matchedKeyword: string | null;
  filterName: string | null;
  createdAt: string;
  // 媒体元信息
  mediaType: string | null;
  mediaFileName: string | null;
  mediaFileSize: number | null;
  mediaMimeType: string | null;
  mediaDuration: number | null;
  mediaThumbBase64: string | null;
  mediaExtra: string | null;
}

export interface LiveChatMessage {
  id: number;
  chatId: string;
  chatTitle: string;
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
  inDatabase: boolean;
  // 媒体元信息
  mediaType: string | null;
  mediaFileName: string | null;
  mediaFileSize: number | null;
  mediaMimeType: string | null;
  mediaDuration: number | null;
  mediaThumbBase64: string | null;
  mediaExtra: string | null;
}

export interface HistoricalFilterPreviewMessage extends LiveChatMessage {
  matchedKeyword: string | null;
}

export interface FilterPreviewResponse {
  messages: HistoricalFilterPreviewMessage[];
  scannedChats: number;
  total: number;
  nextPage?: number;
}

export interface FilterHistoryScope {
  perChatLimit?: number;
  totalLimit?: number;
  page?: number;
  pageSize?: number;
}

export interface FilterBackfillResponse {
  scannedChats: number;
  matchedCount: number;
  savedCount: number;
  skippedExistingCount: number;
}

/** 游标分页响应，data 按 messageDate ASC（旧→新）排列 */
export interface MessageResponse {
  data: Message[];
  hasOlder: boolean;
  hasNewer: boolean;
  /** autoLocate=true 时服务端返回计算好的锚点 ID */
  anchorId?: number | null;
}

export interface Stats {
  total: number;
  unread: number;
  today: number;
}

export interface AuthStatus {
  connected: boolean;
  authorized: boolean;
  waitingForCode: boolean;
  waitingForPassword: boolean;
  telegramConfigured: boolean;
  telegramConfigSource: "env" | "database" | "missing";
  databaseConfigured: boolean;
  apiId: number | null;
  apiHashMasked: string | null;
}

export type NotificationSource = "feishu";

export interface NotificationSettings {
  sources: NotificationSource[];
  feishuWebhookUrl: string;
}

export interface ReadSyncLog {
  id: number;
  level: "info" | "warn" | "error";
  source: string;
  action: string;
  message: string;
  chatId: string | null;
  telegramMessageId: number | null;
  rowId: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
