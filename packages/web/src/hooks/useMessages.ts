import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { Message, MessagePagination, Stats } from "../types";

interface UseMessagesOptions {
  page?: number;
  limit?: number;
  isRead?: string;
  filterId?: string;
  search?: string;
}

export function useMessages(options: UseMessagesOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pagination, setPagination] = useState<MessagePagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.messages.list(options);
      setMessages(res.data);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options.page, options.limit, options.isRead, options.filterId, options.search]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const toggleRead = useCallback(async (id: number) => {
    try {
      const updated = await api.messages.toggleRead(id);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isRead: updated.isRead } : m))
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const refresh = useCallback(() => {
    fetchMessages();
  }, [fetchMessages]);

  return { messages, pagination, loading, error, toggleRead, refresh };
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0, today: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.messages.stats();
      setStats(data);
    } catch {
      // Silently ignore stats errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}
