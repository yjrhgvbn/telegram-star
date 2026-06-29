/** Telegram 会话（群组/频道）基础信息 */
export interface JoinedChat {
  id: string;
  title: string;
}

export type {
  HistoricalFilterPreviewMessage,
  LiveChatMessage,
} from "@telegram-star/shared/contracts/filters";
