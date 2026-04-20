import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { Filter, FilterCondition, JoinedChat } from "../types";

export function useFilters() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [chats, setChats] = useState<JoinedChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatsError, setChatsError] = useState<string | null>(null);

  const fetchFilters = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.filters.list();
      setFilters(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const fetchChats = useCallback(async () => {
    try {
      setChatsLoading(true);
      setChatsError(null);
      const data = await api.chats.list();
      setChats(data);
    } catch (err: any) {
      setChatsError(err.message);
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const createFilter = useCallback(
    async (data: { name: string; conditions: FilterCondition[] }) => {
      const created = await api.filters.create(data);
      setFilters((prev) => [...prev, created]);
      return created;
    },
    []
  );

  const deleteFilter = useCallback(async (id: number) => {
    await api.filters.delete(id);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleFilter = useCallback(async (id: number) => {
    const updated = await api.filters.toggle(id);
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? updated : f))
    );
  }, []);

  return {
    filters,
    chats,
    loading,
    chatsLoading,
    error,
    chatsError,
    createFilter,
    deleteFilter,
    toggleFilter,
    refresh: fetchFilters,
    refreshChats: fetchChats,
  };
}
