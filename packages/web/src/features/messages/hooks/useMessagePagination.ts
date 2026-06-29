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
  loadNewer: () => void;
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

  const loadNewer = useCallback(async () => {
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
        if (isAtBottomRef.current) {
          setMessages((prev) => appendUniqueMessages(prev, result.data));
          setHasPendingNew(false);
        } else {
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

  const loadNewerRef = useRef(loadNewer);
  loadNewerRef.current = loadNewer;

  const flushPending = useCallback(() => {
    setHasPendingNew(false);
    // 用户点击 pending badge 后，下一次新消息请求应直接 append，而不是再次显示 badge。
    isAtBottomRef.current = true;
    void loadNewerRef.current();
  }, []);

  const setAtBottom = useCallback((v: boolean) => {
    isAtBottomRef.current = v;
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
