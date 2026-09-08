import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/shared/api/url";

export type MessageReadFilter = "all" | "unread" | "read";
export type MessageOrder = "asc" | "desc";

export interface MessageViewPosition {
  messageId: number;
  /** scrollTop - virtualItem.start; positive means the row starts above the viewport. */
  offset: number;
}

interface MessageViewState {
  readFilter: MessageReadFilter;
  searchQuery: string;
  searchOpen: boolean;
  order: MessageOrder;
  position: MessageViewPosition | null;
}

const STORAGE_KEY = "telegram-star:message-views:v1";
const MAX_SAVED_VIEWS = 100;
const emptyView = (): MessageViewState => ({
  readFilter: "all", searchQuery: "", searchOpen: false, order: "asc", position: null,
});

function validPosition(value: unknown): value is MessageViewPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as MessageViewPosition;
  return Number.isSafeInteger(position.messageId) && position.messageId > 0
    && Number.isFinite(position.offset) && Math.abs(position.offset) <= 100_000;
}

function readSavedViews(): Map<string, MessageViewState> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return new Map();
    return new Map(saved.slice(-MAX_SAVED_VIEWS).flatMap((entry) => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[1]) return [];
      const view = entry[1] as MessageViewState;
      if (!["all", "unread", "read"].includes(view.readFilter)
        || typeof view.searchQuery !== "string" || view.searchQuery.length > 1000
        || !["asc", "desc"].includes(view.order)) return [];
      return [[entry[0], {
        readFilter: view.readFilter, searchQuery: view.searchQuery,
        searchOpen: Boolean(view.searchOpen), order: view.order,
        position: validPosition(view.position) ? view.position : null,
      }] as [string, MessageViewState]];
    }));
  } catch {
    return new Map();
  }
}

/** Save navigation only, never messages; scroll writes do not trigger React renders. */
export function useMessageViewState(groupKey: string, serverKey = getApiBaseUrl(), active = true) {
  const [views] = useState(readSavedViews);
  const [, updateVersion] = useState(0);
  const [positionReset, resetPositionVersion] = useState(0);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = JSON.stringify([serverKey, groupKey]);
  const current = views.get(key) ?? emptyView();

  const flush = useCallback(() => {
    if (writeTimer.current !== null) clearTimeout(writeTimer.current);
    writeTimer.current = null;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...views].slice(-MAX_SAVED_VIEWS)));
    } catch {
      // Private mode or a full quota must not prevent normal message navigation.
    }
  }, [views]);

  const save = useCallback((next: MessageViewState, immediate: boolean) => {
    views.delete(key);
    views.set(key, next);
    if (views.size > MAX_SAVED_VIEWS) views.delete(views.keys().next().value!);
    if (immediate) flush();
    else if (writeTimer.current === null) writeTimer.current = setTimeout(flush, 250);
  }, [flush, key, views]);

  const update = useCallback((patch: Partial<MessageViewState>, resetPosition = false) => {
    const previous = views.get(key) ?? emptyView();
    save({ ...previous, ...patch, ...(resetPosition ? { position: null } : {}) }, true);
    if (resetPosition || "position" in patch) resetPositionVersion((version) => version + 1);
    updateVersion((version) => version + 1);
  }, [key, save, views]);

  const setReadFilter = useCallback((readFilter: MessageReadFilter) => update({ readFilter }, true), [update]);
  const setSearchQuery = useCallback((searchQuery: string) => update({ searchQuery }, true), [update]);
  const setSearchOpen = useCallback((searchOpen: boolean) => update({ searchOpen }), [update]);
  const setOrder = useCallback((order: MessageOrder) => update({ order }, true), [update]);
  const clearPosition = useCallback(() => update({ position: null }), [update]);
  const fingerprint = JSON.stringify([current.readFilter, current.searchQuery, current.order]);
  const rememberPosition = useCallback((position: MessageViewPosition | null) => {
    if (position !== null && !validPosition(position)) return;
    const latest = views.get(key) ?? emptyView();
    // A leaving list can report one final scroll after the controls changed.
    if (JSON.stringify([latest.readFilter, latest.searchQuery, latest.order]) !== fingerprint) return;
    save({ ...latest, position }, false);
  }, [fingerprint, key, save, views]);

  // Freeze the restore target for this query. New scroll measurements should
  // neither request another around-window nor reposition the active list.
  const restorePosition = useMemo(
    () => views.get(key)?.position ?? null,
    [key, current.readFilter, current.searchQuery, current.order, positionReset, active, views],
  );

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return {
    readFilter: current.readFilter,
    searchQuery: current.searchQuery,
    searchOpen: current.searchOpen,
    order: current.order,
    restorePosition,
    setReadFilter, setSearchQuery, setSearchOpen, setOrder, rememberPosition, clearPosition,
  };
}
