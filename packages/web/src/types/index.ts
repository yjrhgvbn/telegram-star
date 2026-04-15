export interface Filter {
  id: number;
  name: string;
  type: "keyword" | "group" | "channel";
  value: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
