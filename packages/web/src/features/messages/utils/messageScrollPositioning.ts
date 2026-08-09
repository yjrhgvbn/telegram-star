export type MessageScrollAlign = "center" | "end";

export interface MessageScrollTarget {
  index: number;
  align: MessageScrollAlign;
}

export interface MessagePositionItem {
  id: number;
}

export function getInitialMessageScrollTarget<T extends MessagePositionItem>(
  messages: T[],
  anchorId: number | null,
): MessageScrollTarget | null {
  if (messages.length === 0) return null;

  const anchorIndex = anchorId === null
    ? -1
    : messages.findIndex((message) => message.id === anchorId);

  return anchorIndex >= 0
    ? { index: anchorIndex, align: "center" }
    : { index: messages.length - 1, align: "end" };
}
