import type { Message } from "@/types";

export function getMessageFilterMatches(message: Message) {
  // Older servers expose only the primary match; an explicit empty array from
  // newer servers means there is no active rule and must not use that fallback.
  return message.filterMatches ?? (message.matchedFilterId != null ? [{
    filterId: message.matchedFilterId,
    filterName: message.filterName || `规则 ${message.matchedFilterId}`,
    matchedKeyword: message.matchedKeyword,
  }] : []);
}

export function removeMessageRule(messages: Message[], filterId: number, ids: ReadonlySet<number>, currentFilterId?: number): Message[] {
  return messages.flatMap((message) => {
    if (!ids.has(message.id)) return [message];
    if (currentFilterId === filterId) return [];
    const matches = getMessageFilterMatches(message);
    if (!matches.some((match) => match.filterId === filterId)) return [message];
    const remaining = matches.filter((match) => match.filterId !== filterId);
    if (!remaining.length) return [];
    const primary = remaining.find((match) => match.filterId === currentFilterId) ?? remaining[0];
    return [{ ...message, filterMatches: remaining, matchedFilterId: primary.filterId,
      filterName: primary.filterName, matchedKeyword: primary.matchedKeyword }];
  });
}
