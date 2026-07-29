import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Compact page-level toolbar shared by the four workspaces.
 * It intentionally behaves like application chrome instead of a decorative card.
 */
export function WorkspaceHeader({
  title,
  description,
  leading,
  actions,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card/72 px-3 py-2 backdrop-blur-md sm:px-4",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}
