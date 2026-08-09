export type {
  ClientCapabilities,
  ClientDevice,
  ClientDeviceActionResponse,
  ClientDeviceHeartbeatResponse,
  ClientDeviceRegisterInput,
  ClientOs,
  ClientPlatform,
  ClientRuntimeType,
} from "@telegram-star/shared/contracts/clients";

export type {
  Filter,
  FilterBackfillJob,
  FilterBackfillJobCreateInput,
  FilterBackfillJobStatus,
  FilterBackfillMode,
  FilterBackfillResponse,
  FilterCondition,
  FilterConditionType,
  FilterCreateInput,
  FilterHistoryScope,
  FilterPreviewResponse,
  FilterUpdateInput,
  HistoricalFilterPreviewMessage,
  HistoricalFilterPreviewSample,
  LiveChatMessage,
} from "@telegram-star/shared/contracts/filters";

export type {
  ForwardTarget,
  ForwardTargetActionResponse,
  ForwardTargetCreateInput,
  ForwardTargetTestInput,
  ForwardTargetUpdateInput,
} from "@telegram-star/shared/contracts/forward-targets";

export type {
  Message,
  MessageBatchReadResponse,
  MessageContentLink,
  MessageDirection,
  MessageEventPayload,
  MessageForceSyncReadResponse,
  MessageListParams,
  MessageListQuery,
  MessageListResponse,
  MessageReadStateResponse,
  MessageStats,
  ReadSyncLog,
  ReadSyncLogLevel,
  ReadSyncLogsResponse,
} from "@telegram-star/shared/contracts/messages";

export interface JoinedChat {
  id: string;
  title: string;
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
