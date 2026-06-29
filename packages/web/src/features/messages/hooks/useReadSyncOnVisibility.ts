import { useEffect, useRef } from "react";
import { api } from "@/api/client";
import type { Message } from "@/types";

const TELEGRAM_JUMP_MESSAGE_ID_KEY = "telegram_jump_msg_id";
const READ_SYNC_NEIGHBOR_RADIUS = 5;

export type ReadSyncMessage = Pick<Message, "id" | "isRead">;

export interface UseReadSyncOnVisibilityOptions {
  messages: ReadSyncMessage[];
  markAsReadLocal: (ids: number[]) => void;
  neighborRadius?: number;
  syncRead?: (ids: number[]) => Promise<{ markedIds: number[] }>;
}

export function getNearbyUnreadMessageIds(
  messages: ReadSyncMessage[],
  jumpMessageId: number,
  radius = READ_SYNC_NEIGHBOR_RADIUS,
): number[] {
  const jumpIndex = messages.findIndex((message) => message.id === jumpMessageId);
  if (jumpIndex === -1) return [];

  const startIndex = Math.max(0, jumpIndex - radius);
  const endIndex = Math.min(messages.length - 1, jumpIndex + radius);
  const unreadIds: number[] = [];

  for (let index = startIndex; index <= endIndex; index++) {
    if (!messages[index].isRead) {
      unreadIds.push(messages[index].id);
    }
  }

  return unreadIds;
}

export function useReadSyncOnVisibility({
  messages,
  markAsReadLocal,
  neighborRadius = READ_SYNC_NEIGHBOR_RADIUS,
  syncRead = api.messages.forceSyncRead,
}: UseReadSyncOnVisibilityOptions) {
  const messagesRef = useRef(messages);
  const markAsReadLocalRef = useRef(markAsReadLocal);
  const neighborRadiusRef = useRef(neighborRadius);
  const syncReadRef = useRef(syncRead);

  messagesRef.current = messages;
  markAsReadLocalRef.current = markAsReadLocal;
  neighborRadiusRef.current = neighborRadius;
  syncReadRef.current = syncRead;

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      const jumpMessageId = consumeJumpMessageId();
      if (jumpMessageId === null) return;

      const idsToCheck = getNearbyUnreadMessageIds(
        messagesRef.current,
        jumpMessageId,
        neighborRadiusRef.current,
      );
      if (idsToCheck.length === 0) return;

      try {
        const response = await syncReadRef.current(idsToCheck);
        if (response.markedIds.length > 0) {
          markAsReadLocalRef.current(response.markedIds);
        }
      } catch (error) {
        console.error("[ReadSync] proactive sync failed", error);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
}

function consumeJumpMessageId(): number | null {
  if (typeof sessionStorage === "undefined") return null;

  const jumpMessageId = sessionStorage.getItem(TELEGRAM_JUMP_MESSAGE_ID_KEY);
  if (!jumpMessageId) return null;

  sessionStorage.removeItem(TELEGRAM_JUMP_MESSAGE_ID_KEY);

  const parsedId = Number.parseInt(jumpMessageId, 10);
  return Number.isFinite(parsedId) ? parsedId : null;
}
