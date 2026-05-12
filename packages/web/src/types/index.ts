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
}

export interface HistoricalFilterPreviewMessage extends LiveChatMessage {
  matchedKeyword: string | null;
}

export interface FilterPreviewResponse {
  messages: HistoricalFilterPreviewMessage[];
  scannedChats: number;
  total: number;
}

export interface FilterHistoryScope {
  perChatLimit?: number;
  totalLimit?: number;
  chatIds?: string[];
  since?: string;
  until?: string;
}

export interface FilterBackfillResponse {
  scannedChats: number;
  matchedCount: number;
  savedCount: number;
  skippedExistingCount: number;
}

export interface MessagePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MessageResponse {
  data: Message[];
  pagination: MessagePagination;
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
