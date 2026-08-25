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
  ChatDiscoveryChatType,
  ChatDiscoveryMatch,
  ChatDiscoveryResponse,
  ChatDiscoveryResult,
  JoinedChat,
} from "@telegram-star/shared/contracts/chats";

export type {
  Filter,
  FilterBackfillJob,
  FilterBackfillJobCreateInput,
  FilterBackfillJobStatus,
  FilterBackfillMode,
  FilterBackfillResponse,
  FilterCondition,
  FilterConditionEffect,
  FilterConditionType,
  FilterCreateInput,
  FilterEngagementType,
  FilterFocusInput,
  FilterHistoryScope,
  FilterMatchEvidence,
  FilterPreviewResponse,
  FilterSystemKey,
  FilterUpdateInput,
  HistoricalFilterPreviewMessage,
  HistoricalFilterPreviewSample,
  LiveChatMessage,
} from "@telegram-star/shared/contracts/filters";

export type {
  FilterGroup,
  FilterGroupActionResponse,
  FilterGroupCreateInput,
  FilterGroupLayout,
  FilterGroupOrderInput,
  FilterGroupUpdateInput,
  FilterManualOrderInput,
  FilterPlacementInput,
} from "@telegram-star/shared/contracts/filter-groups";

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
  MessageEngagementInput,
  MessageEngagementResponse,
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
