export interface SingleChatMessageLimits {
  messageLimit: number;
  chatSearchLimit: number;
}

export interface SegmentedHistoryLimits {
  batchSize: number;
}

export interface HistoricalPreviewLimits {
  perChatLimit: number;
  totalLimit: number;
  pageSize: number;
  page: number;
}

function clampNumber(value: number | undefined, defaultValue: number, min: number, max: number): number {
  const actualValue = value ?? defaultValue;
  return Math.max(min, Math.min(actualValue, max));
}

export function normalizeSingleChatMessageLimits(options: {
  messageLimit?: number;
  chatSearchLimit?: number;
}): SingleChatMessageLimits {
  return {
    messageLimit: clampNumber(options.messageLimit, 100, 1, 500),
    chatSearchLimit: clampNumber(options.chatSearchLimit, 500, 1, 1000),
  };
}

export function normalizeSegmentedHistoryLimits(options: {
  batchSize?: number;
}): SegmentedHistoryLimits {
  return {
    batchSize: clampNumber(options.batchSize, 100, 20, 200),
  };
}

export function normalizeHistoricalPreviewLimits(options: {
  perChatLimit?: number;
  totalLimit?: number;
  pageSize?: number;
  page?: number;
}): HistoricalPreviewLimits {
  return {
    perChatLimit: clampNumber(options.perChatLimit, 200, 1, 10000),
    totalLimit: clampNumber(options.totalLimit, 50, 1, 1000),
    pageSize: clampNumber(options.pageSize, 100, 1, 500),
    page: Math.max(1, options.page ?? 1),
  };
}

export function normalizeBackfillBatchSize(batchSize?: number): number {
  return clampNumber(batchSize, 50, 1, 500);
}

export function getDialogPageSlice<T>(dialogs: T[], page: number, pageSize: number): T[] {
  return dialogs.slice((page - 1) * pageSize, page * pageSize);
}

export function getNextDialogPage(dialogCount: number, page: number, pageSize: number): number | undefined {
  return dialogCount > page * pageSize ? page + 1 : undefined;
}
