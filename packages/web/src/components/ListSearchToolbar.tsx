import type { ReactNode } from "react";
import "./ListSearchToolbar.css";

/** Shared list entry: flexible search on the left, the primary list action on
 * the right. Popover triggers remain children so they retain their own refs. */
export function ListSearchToolbar({ children }: { children: ReactNode }) {
  return <div className="list-search-toolbar">{children}</div>;
}
