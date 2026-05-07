export type FilterConditionType = "keyword" | "group" | "channel";

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
  type: "group" | "channel";
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
  chatType: "group" | "channel";
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
