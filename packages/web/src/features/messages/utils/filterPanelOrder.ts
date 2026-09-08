// This identifier remains an API layout detail; there is no visible ungrouped
// directory. Independent message groups are rendered directly in the list.
export const UNGROUPED_SECTION_ID = "section:ungrouped";

export function getGroupSectionId(id: number): string {
  return `section:group:${id}`;
}

export function reorderIds<T extends string | number>(
  ids: T[],
  sourceId: T,
  targetId: T,
): T[] | null {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
  const next = [...ids];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}
