import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Message } from "@/types";
import { getInitialMessageScrollTarget } from "../utils/messageScrollPositioning";
import type { MessageOrder, MessageViewPosition } from "./useMessageViewState";

interface MessageVirtualizer {
  scrollToIndex: (
    index: number,
    options?: { align?: "auto" | "start" | "center" | "end" },
  ) => void;
  scrollToEnd: () => void;
  getVirtualItems: () => Array<{ index: number; start: number }>;
  measureElement: (element: HTMLElement | null) => void;
  scrollToOffset: (offset: number, options?: { align?: "start" }) => void;
}

export interface UseMessageScrollPositioningOptions {
  messages: Message[];
  loading: boolean;
  anchorId: number | null;
  virtualizer: MessageVirtualizer;
  restorePosition?: MessageViewPosition | null;
  scrollRef?: RefObject<HTMLDivElement | null>;
  order?: MessageOrder;
}

/**
 * Position the initial window before paint. Prepend stability and following
 * appended messages are owned by TanStack Virtual's end-anchor mode.
 */
export function useMessageScrollPositioning({
  messages,
  loading,
  anchorId,
  virtualizer,
  restorePosition,
  scrollRef,
  order = "asc",
}: UseMessageScrollPositioningOptions) {
  const hasPositionedRef = useRef(false);
  const pendingRestore = useRef<{ messageId: number; index: number; offset: number; landedOffset?: number } | null>(null);

  useLayoutEffect(() => {
    if (loading) {
      hasPositionedRef.current = false;
      pendingRestore.current = null;
      return;
    }
    if (hasPositionedRef.current) return;

    const restoreIndex = restorePosition
      ? messages.findIndex((message) => message.id === restorePosition.messageId)
      : -1;
    if (restorePosition && restoreIndex >= 0) {
      let pending = pendingRestore.current;
      if (!pending || pending.messageId !== restorePosition.messageId || pending.index !== restoreIndex || pending.offset !== restorePosition.offset) {
        pending = { ...restorePosition, index: restoreIndex };
        pendingRestore.current = pending;
        // Index-based scrolling first brings the saved row into the rendered
        // range. Absolute pixels are still estimates until its DOM is mounted.
        virtualizer.scrollToIndex(restoreIndex, { align: "start" });
      }

      const scroller = scrollRef?.current;
      const target = scroller?.querySelector<HTMLElement>(`[data-message-id="${restorePosition.messageId}"]`);
      if (!scroller?.clientHeight || !target) return;
      scroller.querySelectorAll<HTMLElement>("[data-message-id]").forEach((row) => virtualizer.measureElement(row));
      const measured = virtualizer.getVirtualItems().find((item) => item.index === restoreIndex);
      if (!measured) return;

      // getOffsetForIndex("start") clamps to the scroll boundary. Adding the
      // saved delta after that clamp changes the position near the list end.
      // Keep fractional offsets and clamp only the final raw start + delta.
      const desiredOffset = Math.max(0, Math.min(measured.start + restorePosition.offset, Math.max(0, scroller.scrollHeight - scroller.clientHeight)));
      if (pending.landedOffset !== desiredOffset) {
        pending.landedOffset = desiredOffset;
        virtualizer.scrollToOffset(desiredOffset, { align: "start" });
      }
      // Do not let the caller persist an intermediate indexed-scroll position.
      // Native scroll read-back can be delayed until the following commit.
      if (Math.abs(scroller.scrollTop - desiredOffset) < 0.5) {
        hasPositionedRef.current = true;
        pendingRestore.current = null;
      }
      return;
    }

    const target = getInitialMessageScrollTarget(messages, anchorId, order);
    if (!target) return;

    hasPositionedRef.current = true;
    if (target.align === "end" && target.index === messages.length - 1) {
      virtualizer.scrollToEnd();
      return;
    }

    virtualizer.scrollToIndex(target.index, { align: target.align });
    // Virtualizer range changes can commit without changing any hook input;
    // inspect each commit while waiting for the requested row to mount.
  });

  return hasPositionedRef;
}
