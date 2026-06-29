import { useEffect, useRef } from "react";
import {
  messageEventPayloadSchema,
  type MessageEventPayload,
} from "@telegram-star/shared/contracts/messages";

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

export function getMessageEventsUrl(isDev = Boolean(import.meta.env.DEV)) {
  return isDev ? "http://localhost:3000/api/messages/events" : "/api/messages/events";
}

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
  eventsUrl = getMessageEventsUrl(),
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
