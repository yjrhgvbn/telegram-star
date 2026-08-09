import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
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
  loadingOlder: boolean;
  loadingNewer: boolean;
  anchorId: number | null;
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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [hasPendingNew, setHasPendingNew] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  const isAtBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const queryGenerationRef = useRef(0);

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

  const buildCommonParams = useCallback(
    () => buildMessageListBaseParams(optionsRef.current),
    [limit],
  );

  const initialize = useCallback(async () => {
    const generation = queryGenerationRef.current + 1;
    queryGenerationRef.current = generation;

    loadingOlderRef.current = false;
    loadingNewerRef.current = false;
    isAtBottomRef.current = true;

    setLoading(true);
    setLoadingOlder(false);
    setLoadingNewer(false);
    setMessages([]);
    setHasOlder(false);
    setHasNewer(false);
    setAnchorId(null);
    setHasPendingNew(false);

    try {
      const result = await api.messages.list({
        ...buildCommonParams(),
        autoLocate: shouldAutoLocateMessages(optionsRef.current) || undefined,
      });
      if (generation !== queryGenerationRef.current) return;

      setMessages(result.data);
      setHasOlder(result.hasOlder);
      setHasNewer(result.hasNewer);
      setAnchorId(result.anchorId ?? null);
    } catch {
      // 加载失败保持空列表，由用户手动刷新或切换条件后再试。
    } finally {
      if (generation === queryGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [buildCommonParams]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasOlder) return;
    const oldestMsg = messagesRef.current[0];
    if (!oldestMsg) return;

    const generation = queryGenerationRef.current;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const result = await api.messages.list({
        ...buildCommonParams(),
        cursorId: oldestMsg.id,
        direction: "before",
      });
      if (generation !== queryGenerationRef.current) return;

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
  }, [hasOlder, buildCommonParams]);

  const loadNewer = useCallback(async (
    loadOptions: LoadNewerMessagesOptions = {},
  ) => {
    if (loadingNewerRef.current) return;

    const generation = queryGenerationRef.current;
    loadingNewerRef.current = true;
    setLoadingNewer(true);

    try {
      const newestMsg = messagesRef.current[messagesRef.current.length - 1];
      const result = await api.messages.list({
        ...buildCommonParams(),
        cursorId: newestMsg?.id,
        direction: newestMsg ? "after" : undefined,
      });
      if (generation !== queryGenerationRef.current) return;

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
  }, [buildCommonParams]);

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

  useEffect(() => {
    void initialize();
  }, [initialize, options.isRead, options.filterId, options.search, options.autoLocateEnabled]);

  const markAsReadLocal = useCallback((ids: number[]) => {
    setMessages((prev) => markMessagesAsRead(prev, ids));
  }, []);

  const setMessageReadState = useCallback((id: number, isRead: boolean) => {
    setMessages((prev) => updateMessageReadState(prev, id, isRead));
  }, []);

  const refresh = useCallback(() => {
    void initialize();
  }, [initialize]);

  return {
    messages,
    hasOlder,
    hasNewer,
    loading,
    loadingOlder,
    loadingNewer,
    anchorId,
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
