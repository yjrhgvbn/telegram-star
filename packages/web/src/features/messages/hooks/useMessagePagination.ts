import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { getApiBaseUrl } from "@/shared/api/url";
import type { Message } from "@/types";
import {
  appendUniqueMessages,
  markMessagesAsRead,
  prependUniqueMessages,
  updateMessageReadState,
} from "../utils/messageMerge";
import {
  buildMessageListBaseParams,
  shouldAutoLocateMessages,
  type MessagePaginationParamsInput,
} from "../utils/messagePaginationParams";

export interface UseMessagePaginationOptions {
  limit?: number;
  isRead?: boolean;
  filterId?: number;
  search?: string;
  /** 是否启用"自动定位到最近已读相邻的未读消息"功能 */
  autoLocateEnabled?: boolean;
  /** Saved visible message; used only when entering a query, never on refresh. */
  restoreAnchorId?: number | null;
  enabled?: boolean;
}

export interface LoadNewerMessagesOptions {
  /** SSE 到达新消息时，若用户不在底部则显示提示；滚动分页不需要提示。 */
  announceWhenAwayFromBottom?: boolean;
}

export interface UseMessagePaginationReturn {
  messages: Message[];
  hasOlder: boolean;
  hasNewer: boolean;
  loading: boolean;
  error: string | null;
  loadingOlder: boolean;
  loadingNewer: boolean;
  anchorId: number | null;
  /** A saved anchor was present in the returned window; otherwise null. */
  restoredAnchorId: number | null;
  hasPendingNew: boolean;
  loadOlder: () => void;
  loadNewer: (options?: LoadNewerMessagesOptions) => void;
  flushPending: () => void;
  setAtBottom: (v: boolean) => void;
  markAsReadLocal: (ids: number[]) => void;
  setMessageReadState: (id: number, isRead: boolean) => void;
  refresh: () => void;
}

const DEFAULT_MESSAGE_LIMIT = 20;

export function useMessagePagination(
  options: UseMessagePaginationOptions = {},
): UseMessagePaginationReturn {
  const limit = options.limit ?? DEFAULT_MESSAGE_LIMIT;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [restoredAnchorId, setRestoredAnchorId] = useState<number | null>(null);
  const [hasPendingNew, setHasPendingNew] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  const isAtBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const queryGenerationRef = useRef(0);
  const initializingRef = useRef(false);
  const pendingInitialEventRef = useRef(false);
  const loadNewerAfterInitialRef = useRef<(options: LoadNewerMessagesOptions) => void>(() => {});
  const enabled = options.enabled !== false;
  const queryKey = JSON.stringify([
    getApiBaseUrl(), limit, options.isRead, options.filterId,
    options.search, options.autoLocateEnabled, enabled,
  ]);
  const currentQueryRef = useRef(queryKey);
  const initializedQueryRef = useRef<string | null>(null);
  currentQueryRef.current = queryKey;

  messagesRef.current = messages;

  const resolvedOptions: MessagePaginationParamsInput = {
    limit,
    isRead: options.isRead,
    filterId: options.filterId,
    search: options.search,
    autoLocateEnabled: options.autoLocateEnabled,
  };

  const optionsRef = useRef(resolvedOptions);
  optionsRef.current = resolvedOptions;
  const restoreAnchorRef = useRef(options.restoreAnchorId);
  restoreAnchorRef.current = options.restoreAnchorId;

  const buildCommonParams = useCallback(
    () => buildMessageListBaseParams(optionsRef.current),
    [limit],
  );

  const initialize = useCallback(async (restore = true) => {
    if (options.enabled === false) return;
    const requestKey = currentQueryRef.current;
    const snapshot = optionsRef.current;
    const savedAnchor = restore ? restoreAnchorRef.current : null;
    const generation = queryGenerationRef.current + 1;
    queryGenerationRef.current = generation;
    initializedQueryRef.current = requestKey;
    initializingRef.current = true;
    pendingInitialEventRef.current = false;
    messagesRef.current = [];

    loadingOlderRef.current = false;
    loadingNewerRef.current = false;
    isAtBottomRef.current = true;

    setLoading(true);
    setError(null);
    setLoadingOlder(false);
    setLoadingNewer(false);
    setMessages([]);
    setHasOlder(false);
    setHasNewer(false);
    setAnchorId(null);
    setRestoredAnchorId(null);
    setHasPendingNew(false);

    let loaded = false;
    try {
      const initialParams = {
        ...buildMessageListBaseParams(snapshot),
        autoLocate: shouldAutoLocateMessages(snapshot) || undefined,
      };
      let result;
      try {
        result = await api.messages.list(savedAnchor ? {
          ...buildMessageListBaseParams(snapshot), cursorId: savedAnchor, direction: "around",
        } : initialParams);
      } catch (error) {
        // A deleted bookmark must not strand the user on an empty message list.
        if (!savedAnchor || !(error instanceof Error) || !error.message.includes("Cursor message not found")) throw error;
        if (generation !== queryGenerationRef.current || requestKey !== currentQueryRef.current) return;
        result = await api.messages.list(initialParams);
      }
      if (generation !== queryGenerationRef.current || requestKey !== currentQueryRef.current) return;

      messagesRef.current = result.data;
      loaded = true;
      setMessages(result.data);
      setHasOlder(result.hasOlder);
      setHasNewer(result.hasNewer);
      const restored = savedAnchor && result.data.some((message) => message.id === savedAnchor) ? savedAnchor : null;
      setRestoredAnchorId(restored);
      setAnchorId(restored ?? result.anchorId ?? null);
    } catch (error) {
      if (generation === queryGenerationRef.current && requestKey === currentQueryRef.current) {
        setError(error instanceof Error ? error.message : "消息加载失败，请重试");
      }
    } finally {
      if (generation === queryGenerationRef.current) {
        initializingRef.current = false;
        setLoading(false);
        if (pendingInitialEventRef.current && loaded) {
          pendingInitialEventRef.current = false;
          loadNewerAfterInitialRef.current({ announceWhenAwayFromBottom: true });
        }
      }
    }
  }, [options.enabled]);

  const loadOlder = useCallback(async () => {
    if (!enabled || initializingRef.current || initializedQueryRef.current !== currentQueryRef.current || loadingOlderRef.current || !hasOlder) return;
    const oldestMsg = messagesRef.current[0];
    if (!oldestMsg) return;

    const generation = queryGenerationRef.current;
    const requestKey = currentQueryRef.current;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const result = await api.messages.list({
        ...buildCommonParams(),
        cursorId: oldestMsg.id,
        direction: "before",
      });
      if (generation !== queryGenerationRef.current || requestKey !== currentQueryRef.current) return;

      setMessages((prev) => prependUniqueMessages(prev, result.data));
      setHasOlder(result.hasOlder);
    } catch {
      // ignore
    } finally {
      if (generation === queryGenerationRef.current) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [enabled, hasOlder, buildCommonParams]);

  const loadNewer = useCallback(async (
    loadOptions: LoadNewerMessagesOptions = {},
  ) => {
    if (!enabled || initializedQueryRef.current !== currentQueryRef.current) return;
    if (initializingRef.current) {
      if (loadOptions.announceWhenAwayFromBottom) pendingInitialEventRef.current = true;
      return;
    }
    if (loadingNewerRef.current) return;

    const generation = queryGenerationRef.current;
    const requestKey = currentQueryRef.current;
    loadingNewerRef.current = true;
    setLoadingNewer(true);

    try {
      const newestMsg = messagesRef.current[messagesRef.current.length - 1];
      const result = await api.messages.list({
        ...buildCommonParams(),
        cursorId: newestMsg?.id,
        direction: newestMsg ? "after" : undefined,
      });
      if (generation !== queryGenerationRef.current || requestKey !== currentQueryRef.current) return;

      if (result.data.length > 0) {
        // 已请求成功的分页数据必须立即合并；否则 hasNewer 变为 false 后，
        // 这一页会永久丢失。SSE 只负责决定是否提示，不参与是否合并。
        setMessages((prev) => appendUniqueMessages(prev, result.data));

        if (isAtBottomRef.current) {
          setHasPendingNew(false);
        } else if (loadOptions.announceWhenAwayFromBottom) {
          setHasPendingNew(true);
        }
      }
      setHasNewer(result.hasNewer);
    } catch {
      // ignore
    } finally {
      if (generation === queryGenerationRef.current) {
        loadingNewerRef.current = false;
        setLoadingNewer(false);
      }
    }
  }, [enabled, buildCommonParams]);
  loadNewerAfterInitialRef.current = loadNewer;

  const flushPending = useCallback(() => {
    setHasPendingNew(false);
    // 数据在请求成功时已经 append；这里只需让列表滚到现有数据末尾。
    isAtBottomRef.current = true;
  }, []);

  const setAtBottom = useCallback((v: boolean) => {
    isAtBottomRef.current = v;
    if (v) {
      setHasPendingNew(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (enabled) void initialize();
    // Invalidate before the next group can issue requests, including unmounts.
    return () => { queryGenerationRef.current += 1; };
  }, [enabled, initialize, queryKey]);

  const markAsReadLocal = useCallback((ids: number[]) => {
    setMessages((prev) => markMessagesAsRead(prev, ids));
  }, []);

  const setMessageReadState = useCallback((id: number, isRead: boolean) => {
    setMessages((prev) => updateMessageReadState(prev, id, isRead));
  }, []);

  const refresh = useCallback(() => {
    void initialize(false);
  }, [initialize]);

  return {
    messages: enabled && initializedQueryRef.current === queryKey ? messages : [],
    hasOlder,
    hasNewer,
    loading: enabled && (initializedQueryRef.current !== queryKey || loading),
    error: enabled && initializedQueryRef.current === queryKey ? error : null,
    loadingOlder,
    loadingNewer,
    anchorId,
    restoredAnchorId,
    hasPendingNew,
    loadOlder,
    loadNewer,
    flushPending,
    setAtBottom,
    markAsReadLocal,
    setMessageReadState,
    refresh,
  };
}
