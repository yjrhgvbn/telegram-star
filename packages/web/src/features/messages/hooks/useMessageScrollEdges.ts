import { useEffect, useRef, type RefObject } from "react";

const MIN_EDGE_THRESHOLD = 300;
const VIEWPORT_PREFETCH_RATIO = 0.75;
const AT_BOTTOM_THRESHOLD = 50;

export interface MessageScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface MessageScrollEdgeState {
  nearTop: boolean;
  nearBottom: boolean;
  atBottom: boolean;
}

export interface UseMessageScrollEdgesOptions {
  scrollRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  hasOlder: boolean;
  hasNewer: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onSetAtBottom: (value: boolean) => void;
}

export function getMessageScrollEdgeState(
  metrics: MessageScrollMetrics,
  edgeThreshold = Math.max(MIN_EDGE_THRESHOLD, metrics.clientHeight * VIEWPORT_PREFETCH_RATIO),
  atBottomThreshold = AT_BOTTOM_THRESHOLD,
): MessageScrollEdgeState {
  const gap = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;

  return {
    nearTop: metrics.scrollTop <= edgeThreshold,
    nearBottom: gap <= edgeThreshold,
    atBottom: gap < atBottomThreshold,
  };
}

export function useMessageScrollEdges({
  scrollRef,
  enabled,
  hasOlder,
  hasNewer,
  loadingOlder,
  loadingNewer,
  onLoadOlder,
  onLoadNewer,
  onSetAtBottom,
}: UseMessageScrollEdgesOptions) {
  const isAtBottomRef = useRef(true);
  const latestRef = useRef({
    hasOlder,
    hasNewer,
    loadingOlder,
    loadingNewer,
    onLoadOlder,
    onLoadNewer,
    onSetAtBottom,
  });

  latestRef.current = {
    hasOlder,
    hasNewer,
    loadingOlder,
    loadingNewer,
    onLoadOlder,
    onLoadNewer,
    onSetAtBottom,
  };

  useEffect(() => {
    if (!enabled) return;

    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      const edgeState = getMessageScrollEdgeState({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
      const latest = latestRef.current;

      if (edgeState.nearTop && latest.hasOlder && !latest.loadingOlder) {
        latest.onLoadOlder();
      }

      if (edgeState.nearBottom && latest.hasNewer && !latest.loadingNewer) {
        latest.onLoadNewer();
      }

      isAtBottomRef.current = edgeState.atBottom;
      latest.onSetAtBottom(edgeState.atBottom);
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [enabled, scrollRef]);

  return isAtBottomRef;
}
