import {
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { Message } from "@/types";
import {
  getInitialMessageScrollTarget,
  getPrependCompensationHeight,
} from "../utils/messageScrollPositioning";

interface MessageVirtualizer {
  scrollToIndex: (index: number, options?: { align?: "auto" | "start" | "center" | "end" }) => void;
}

export interface UseMessageScrollPositioningOptions {
  messages: Message[];
  loading: boolean;
  anchorId: number | null;
  scrollRef: RefObject<HTMLElement | null>;
  virtualizer: MessageVirtualizer;
  isAtBottomRef: RefObject<boolean>;
  estimateCompensationHeight: (message: Message) => number;
}

export function useMessageScrollPositioning({
  messages,
  loading,
  anchorId,
  scrollRef,
  virtualizer,
  isAtBottomRef,
  estimateCompensationHeight,
}: UseMessageScrollPositioningOptions) {
  usePrependScrollCompensation({
    messages,
    loading,
    scrollRef,
    estimateCompensationHeight,
  });

  useInitialMessageScroll({
    messages,
    loading,
    anchorId,
    virtualizer,
  });

  useFollowNewMessages({
    messages,
    virtualizer,
    isAtBottomRef,
  });
}

function usePrependScrollCompensation({
  messages,
  loading,
  scrollRef,
  estimateCompensationHeight,
}: Pick<
  UseMessageScrollPositioningOptions,
  "messages" | "loading" | "scrollRef" | "estimateCompensationHeight"
>) {
  const previousFirstIdRef = useRef<number | undefined>(undefined);
  const previousLoadingRef = useRef(loading);

  useLayoutEffect(() => {
    if (loading) {
      if (!previousLoadingRef.current) {
        previousFirstIdRef.current = undefined;
      }
      previousLoadingRef.current = loading;
      return;
    }

    previousLoadingRef.current = loading;
    if (messages.length === 0) return;

    const compensationHeight = getPrependCompensationHeight(
      messages,
      previousFirstIdRef.current,
      estimateCompensationHeight,
    );
    if (compensationHeight > 0 && scrollRef.current) {
      scrollRef.current.scrollTop += compensationHeight;
    }

    previousFirstIdRef.current = messages[0].id;
  }, [estimateCompensationHeight, loading, messages, scrollRef]);
}

function useInitialMessageScroll({
  messages,
  loading,
  anchorId,
  virtualizer,
}: Pick<UseMessageScrollPositioningOptions, "messages" | "loading" | "anchorId" | "virtualizer">) {
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (loading) {
      hasScrolledRef.current = false;
      return;
    }
    if (hasScrolledRef.current) return;

    const target = getInitialMessageScrollTarget(messages, anchorId);
    if (!target) return;

    hasScrolledRef.current = true;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const frameId = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(target.index, { align: target.align });
      // Dynamic media heights can settle after the first virtualizer pass.
      timeoutId = setTimeout(() => {
        virtualizer.scrollToIndex(target.index, { align: target.align });
      }, 150);
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [anchorId, loading, messages, virtualizer]);
}

function useFollowNewMessages({
  messages,
  virtualizer,
  isAtBottomRef,
}: Pick<UseMessageScrollPositioningOptions, "messages" | "virtualizer" | "isAtBottomRef">) {
  const previousLastIdRef = useRef<number | undefined>(undefined);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (messages.length === 0 || lastMessageId === undefined) return;

    if (
      previousLastIdRef.current !== undefined &&
      lastMessageId !== previousLastIdRef.current &&
      isAtBottomRef.current
    ) {
      const frameId = requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      });
      previousLastIdRef.current = lastMessageId;
      return () => cancelAnimationFrame(frameId);
    }

    previousLastIdRef.current = lastMessageId;
  }, [isAtBottomRef, lastMessageId, messages.length, virtualizer]);
}
