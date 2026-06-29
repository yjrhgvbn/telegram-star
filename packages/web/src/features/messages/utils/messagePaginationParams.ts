import type { MessageListParams } from "@telegram-star/shared/contracts/messages";

export interface MessagePaginationParamsInput {
  limit: number;
  isRead?: boolean;
  filterId?: number;
  search?: string;
  autoLocateEnabled?: boolean;
}

export function buildMessageListBaseParams(
  input: MessagePaginationParamsInput,
): MessageListParams {
  return {
    limit: input.limit,
    isRead: input.isRead,
    filterId: input.filterId || undefined,
    search: input.search || undefined,
  };
}

export function shouldAutoLocateMessages(input: MessagePaginationParamsInput) {
  return Boolean(input.autoLocateEnabled && input.isRead === undefined && !input.search);
}
