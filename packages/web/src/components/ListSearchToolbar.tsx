import type { ReactNode } from "react";
import "./ListSearchToolbar.css";

/** Mobile roots get a page heading; desktop keeps its compact sidebar toolbar.
 * The same action element stays mounted so popover refs and focus are preserved. */
export function ListSearchToolbar({ children, mobileTitle }: { children: ReactNode; mobileTitle?: string }) {
  return <div className="list-search-toolbar" data-mobile-title={mobileTitle ? "" : undefined}>
    {mobileTitle ? <h2 className="list-search-toolbar__title">{mobileTitle}</h2> : null}
    {children}
  </div>;
}
