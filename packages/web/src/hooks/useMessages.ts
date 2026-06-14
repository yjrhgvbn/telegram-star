import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { api } from "../api/client";
import type { Message, Stats } from "../types";

interface UseMessagesOptions {
  limit?: number;
  isRead?: string;
  filterId?: string;
  search?: string;
  /** 是否启用"自动定位到最近已读相邻的未读消息"功能 */
  autoLocateEnabled?: boolean;
}

export interface UseMessagesReturn {
  messages: Message[];         // ASC 顺序（旧→新），与页面渲染顺序一致
  hasOlder: boolean;           // 是否有更旧的消息可加载
  hasNewer: boolean;           // 是否有更新的消息可加载
  loading: boolean;            // 初始加载中
  loadingOlder: boolean;       // 向上加载更旧消息中
  loadingNewer: boolean;       // 向下加载更新消息中
  anchorId: number | null;     // 初始定位锚点消息 ID（null 时默认滚底）
  hasPendingNew: boolean;      // SSE 推送了新消息但用户不在底部，需显示 badge
  loadOlder: () => void;       // 触发加载更旧消息（prepend）
  loadNewer: () => void;       // 触发加载更新消息（append）
  flushPending: () => void;    // 用户点击 badge 时：清除 pending 状态并触发 loadNewer
  setAtBottom: (v: boolean) => void; // MessageList 通知当前是否在底部
  toggleRead: (id: number) => Promise<void>;
  markAsReadLocal: (ids: number[]) => void;
  refresh: () => void;
}

export function useMessages(options: UseMessagesOptions = {}): UseMessagesReturn {
  const limit = options.limit ?? 20;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [hasPendingNew, setHasPendingNew] = useState(false);

  // 用 ref 追踪实时状态，供 SSE 回调使用（避免闭包捕获旧值）
  const messagesRef = useRef<Message[]>([]);
  const isAtBottomRef = useRef(true);
  const loadingNewerRef = useRef(false);

  messagesRef.current = messages;

  // 当前过滤参数，用于请求和选项变更检测
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** 构建请求公共参数 */
  const buildCommonParams = useCallback(() => ({
    limit,
    isRead: optionsRef.current.isRead,
    filterId: optionsRef.current.filterId || undefined,
    search: optionsRef.current.search || undefined,
  }), [limit]);

  /** 初始化：获取锚点（若 autoLocate）并加载第一屏数据 */
  const initialize = useCallback(async () => {
    setLoading(true);
    setMessages([]);
    setHasOlder(false);
    setHasNewer(false);
    setAnchorId(null);
    setHasPendingNew(false);

    const { isRead, search, autoLocateEnabled } = optionsRef.current;

    // 仅在没有 isRead 过滤、没有搜索词时才尝试获取锚点
    // （过滤视图中锚点逻辑无意义）
    const useAutoLocate = Boolean(autoLocateEnabled && !isRead && !search);

    try {
      const result = await api.messages.list({
        ...buildCommonParams(),
        autoLocate: useAutoLocate || undefined,
      });
      setMessages(result.data);
      setHasOlder(result.hasOlder);
      setHasNewer(result.hasNewer);
      // autoLocate 请求时服务端返回 anchorId，否则为 undefined（表示无锚点，默认滚底）
      setAnchorId(result.anchorId ?? null);
    } catch {
      // 加载失败保持空列表
    } finally {
      setLoading(false);
    }
  }, [buildCommonParams]);

  /** 加载更旧的消息（prepend）*/
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder) return;
    const oldestMsg = messagesRef.current[0];
    if (!oldestMsg) return;

    setLoadingOlder(true);
    try {
      const result = await api.messages.list({
        ...buildCommonParams(),
        cursorId: oldestMsg.id,
        direction: "before",
      });
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const unique = result.data.filter((m) => !existingIds.has(m.id));
        return [...unique, ...prev];
      });
      setHasOlder(result.hasOlder);
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasOlder, buildCommonParams]);

  /** 加载更新的消息（append）*/
  const loadNewer = useCallback(async () => {
    if (loadingNewerRef.current) return;
    loadingNewerRef.current = true;
    setLoadingNewer(true);

    try {
      const newestMsg = messagesRef.current[messagesRef.current.length - 1];
      const result = await api.messages.list({
        ...buildCommonParams(),
        cursorId: newestMsg?.id,
        direction: newestMsg ? "after" : undefined,
      });

      if (result.data.length > 0) {
        if (isAtBottomRef.current) {
          // 用户在底部：静默追加
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const unique = result.data.filter((m) => !existingIds.has(m.id));
            return unique.length > 0 ? [...prev, ...unique] : prev;
          });
          setHasPendingNew(false);
        } else {
          // 用户不在底部：设置 badge 提示
          setHasPendingNew(true);
        }
      }
      setHasNewer(result.hasNewer);
    } catch {
      // ignore
    } finally {
      loadingNewerRef.current = false;
      setLoadingNewer(false);
    }
  }, [buildCommonParams]);

  // 用 ref 保持 loadNewer 最新引用，供 SSE 回调调用
  const loadNewerRef = useRef(loadNewer);
  loadNewerRef.current = loadNewer;

  /** 清除 pending 状态，触发 loadNewer（用户点击 badge 时调用）*/
  const flushPending = useCallback(() => {
    setHasPendingNew(false);
    // 强制视为"在底部"，确保 loadNewer 能 append 而非再次设 pending
    isAtBottomRef.current = true;
    void loadNewerRef.current();
  }, []);

  /** 由 MessageList 调用，通知当前是否在底部 */
  const setAtBottom = useCallback((v: boolean) => {
    isAtBottomRef.current = v;
  }, []);

  // 选项变更时重置并重新初始化
  useEffect(() => {
    void initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.isRead, options.filterId, options.search, options.autoLocateEnabled]);

  // SSE 实时推送：新消息到达时，根据是否在底部决定是否静默追加
  const sseUrl = import.meta.env.DEV
    ? "http://localhost:3000/api/messages/events"
    : "/api/messages/events";

  /** 局部批量更新已读状态（例如通过主动拉取状态后更新） */
  const markAsReadLocal = useCallback((ids: number[]) => {
    setMessages((prev) =>
      prev.map((msg) => (ids.includes(msg.id) ? { ...msg, isRead: true } : msg))
    );
  }, []);

  useEffect(() => {
    const es = new EventSource(sseUrl);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === "new") {
          void loadNewerRef.current();
        } else if (payload.type === "read" && Array.isArray(payload.messageIds)) {
          markAsReadLocal(payload.messageIds);
        }
      } catch (err) {
        // Fallback for old string payload formats during development
        if (e.data === "new" || e.data === "read") {
          void loadNewerRef.current();
        }
      }
    };
    return () => es.close();
  }, [sseUrl, markAsReadLocal]);

  /** 乐观更新已读状态 */
  const toggleRead = useCallback(async (id: number) => {
    const updated = await api.messages.toggleRead(id);
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, isRead: updated.isRead } : msg)),
    );
  }, []);


  /** 强制刷新（重新初始化） */
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
    toggleRead,
    markAsReadLocal,
    refresh,
  };
}

export function useStats() {
  const { data, isLoading, mutate } = useSWR<Stats>("message-stats", api.messages.stats);

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    stats: data ?? { total: 0, unread: 0, today: 0 },
    loading: isLoading,
    refresh,
  };
}

