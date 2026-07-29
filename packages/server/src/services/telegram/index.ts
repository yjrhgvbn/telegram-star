/** 统一导出 telegram/ 子模块的公开 API */
export type {
  JoinedChat,
  LiveChatMessage,
  HistoricalFilterPreviewMessage,
  HistoricalFilterPreviewSample,
} from "./types.js";
export {
  getClient,
  getConnectionStatusWithConfig as getConnectionStatus,
  setClient,
  setConnected,
} from "./client.js";
export { syncReadByTelegramInteractions } from "./listener.js";
export { listJoinedChats, listSingleChatMessages, previewHistoricalFilterMessages, backfillFilterHistory } from "./history.js";
export { initClient, sendCode, loginWithCode, logout } from "./auth.js";
