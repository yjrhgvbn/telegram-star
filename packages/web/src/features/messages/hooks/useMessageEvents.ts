import { useEffect, useRef } from "react";
import {
  messageEventPayloadSchema,
  type MessageEventPayload,
} from "@telegram-star/shared/contracts/messages";
import { getMessageEventsUrl as resolveMessageEventsUrl } from "@/shared/api/url";

export { getMessageEventsUrl } from "@/shared/api/url";

type LegacyMessageEventPayload = { type: "legacy-refresh" };
export type ParsedMessageEventPayload = MessageEventPayload | LegacyMessageEventPayload;

interface MessageEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  close: () => void;
}

export interface UseMessageEventsOptions {
  onNewMessage: () => void;
  onReadMessages: (ids: number[]) => void;
  eventsUrl?: string;
  createEventSource?: (url: string) => MessageEventSource;
}

const defaultCreateMessageEventSource = (url: string) => new EventSource(url);

export function parseMessageEventData(data: string): ParsedMessageEventPayload | null {
  try {
    const parsed = messageEventPayloadSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    // Older dev payloads sent plain strings. Both mean "refresh newest state".
    return data === "new" || data === "read" ? { type: "legacy-refresh" } : null;
  }
}

export function useMessageEvents({
  onNewMessage,
  onReadMessages,
  eventsUrl = resolveMessageEventsUrl(),
  createEventSource = defaultCreateMessageEventSource,
}: UseMessageEventsOptions) {
  const handlersRef = useRef({ onNewMessage, onReadMessages });
  handlersRef.current = { onNewMessage, onReadMessages };

  useEffect(() => {
    const eventSource = createEventSource(eventsUrl);
    eventSource.onmessage = (event) => {
      const payload = parseMessageEventData(event.data);
      if (!payload) return;

      if (payload.type === "read") {
        handlersRef.current.onReadMessages(payload.messageIds);
        return;
      }

      handlersRef.current.onNewMessage();
    };

    return () => eventSource.close();
  }, [createEventSource, eventsUrl]);
}
