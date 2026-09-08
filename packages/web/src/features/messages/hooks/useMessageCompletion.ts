import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { getApiBaseUrl } from "@/shared/api/url";
import { queryKeys } from "@/shared/query/queryKeys";
import type { Message } from "@/types";

interface Options {
  scope: string;
  messages: Message[];
  toggleRead: (id: number) => Promise<void>;
  markAsReadLocal: (ids: number[]) => void;
}

/** Keep completion explicit and lock repeated clicks. Success is reflected in
 * the message itself; only failed writes need separate feedback. */
export function useMessageCompletion({ scope, messages, toggleRead, markAsReadLocal }: Options) {
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latest = useRef({ scope, messages, toggleRead, markAsReadLocal });
  latest.current = { scope, messages, toggleRead, markAsReadLocal };

  useEffect(() => { setError(null); }, [scope]);

  const apply = useCallback(async (ids: number[], done: boolean) => {
    if (lock.current) return;
    setError(null);
    const current = latest.current;
    const server = getApiBaseUrl();
    const active = () => mounted.current && getApiBaseUrl() === server;
    const selected = new Set(ids);
    const changes = current.messages
      .filter((message) => selected.has(message.id) && message.isRead !== done)
      .map((message) => message.id);
    if (!changes.length) return;
    lock.current = true;
    setPendingIds(new Set(changes));
    let succeeded = 0;
    let failed = 0;
    try {
      if (done) {
        // The existing batch endpoint only supports completing messages.
        await api.messages.batchRead(changes);
        if (active()) current.markAsReadLocal(changes);
        succeeded = changes.length;
      } else {
        // Restoration uses the existing toggle endpoint in sequence, avoiding bursts.
        for (const id of changes) {
          if (!active()) break;
          // A synchronized update may have already restored this row.
          const known = latest.current.messages.find((message) => message.id === id);
          if (known && known.isRead === done) continue;
          try {
            await current.toggleRead(id);
            succeeded += 1;
          } catch { failed += 1; }
        }
      }
    } catch { failed = changes.length; }
    finally {
      lock.current = false;
      if (mounted.current) setPendingIds(new Set());
      if (active()) void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
      if (active()) void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
    }
    if (!active() || latest.current.scope !== current.scope) return;
    if (failed) setError(`${succeeded ? `已处理 ${succeeded} 条；` : ""}${failed} 条保存失败，请重试`);
  }, [queryClient]);

  const toggle = useCallback((id: number) => {
    const message = latest.current.messages.find((item) => item.id === id);
    if (message) void apply([id], !message.isRead);
  }, [apply]);

  const dismissError = useCallback(() => setError(null), []);

  return { pendingIds, error, apply, toggle, dismissError };
}
