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

export function getPrependCompensationHeight<T extends MessagePositionItem>(
  messages: T[],
  previousFirstId: number | undefined,
  estimateHeight: (message: T) => number,
) {
  if (previousFirstId === undefined || messages.length === 0) return 0;

  const previousFirstIndex = messages.findIndex((message) => message.id === previousFirstId);
  if (previousFirstIndex <= 0) return 0;

  let height = 0;
  for (let index = 0; index < previousFirstIndex; index++) {
    height += estimateHeight(messages[index]);
  }
  return height;
}
