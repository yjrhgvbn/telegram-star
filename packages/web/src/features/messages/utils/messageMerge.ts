import type { Message } from "@/types";

export function appendUniqueMessages(current: Message[], incoming: Message[]): Message[] {
  return mergeUniqueMessages(current, incoming, "append");
}

export function prependUniqueMessages(current: Message[], incoming: Message[]): Message[] {
  return mergeUniqueMessages(current, incoming, "prepend");
}

export function markMessagesAsRead(messages: Message[], ids: number[]): Message[] {
  if (ids.length === 0) return messages;

  const idSet = new Set(ids);
  return messages.map((message) =>
    idSet.has(message.id) ? { ...message, isRead: true } : message,
  );
}

export function updateMessageReadState(messages: Message[], id: number, isRead: boolean): Message[] {
  return messages.map((message) =>
    message.id === id ? { ...message, isRead } : message,
  );
}

function mergeUniqueMessages(
  current: Message[],
  incoming: Message[],
  direction: "append" | "prepend",
): Message[] {
  if (incoming.length === 0) return current;

  const existingIds = new Set(current.map((message) => message.id));
  const uniqueIncoming = incoming.filter((message) => !existingIds.has(message.id));
  if (uniqueIncoming.length === 0) return current;

  return direction === "prepend"
    ? [...uniqueIncoming, ...current]
    : [...current, ...uniqueIncoming];
}
