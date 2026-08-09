import { useLayoutEffect, useRef } from "react";
import type { Message } from "@/types";
import { getInitialMessageScrollTarget } from "../utils/messageScrollPositioning";

interface MessageVirtualizer {
  scrollToIndex: (
    index: number,
    options?: { align?: "auto" | "start" | "center" | "end" },
  ) => void;
  scrollToEnd: () => void;
}

export interface UseMessageScrollPositioningOptions {
  messages: Message[];
  loading: boolean;
  anchorId: number | null;
  virtualizer: MessageVirtualizer;
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
}: UseMessageScrollPositioningOptions) {
  const hasPositionedRef = useRef(false);

  useLayoutEffect(() => {
    if (loading) {
      hasPositionedRef.current = false;
      return;
    }
    if (hasPositionedRef.current) return;

    const target = getInitialMessageScrollTarget(messages, anchorId);
    if (!target) return;

    hasPositionedRef.current = true;
    if (target.align === "end" && target.index === messages.length - 1) {
      virtualizer.scrollToEnd();
      return;
    }

    virtualizer.scrollToIndex(target.index, { align: target.align });
  }, [anchorId, loading, messages, virtualizer]);
}
