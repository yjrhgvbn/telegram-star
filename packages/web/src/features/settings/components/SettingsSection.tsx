import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  eyebrow,
  title,
  description,
  meta,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 text-card-foreground", className)}>
      <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
            {eyebrow ?? `系统 / ${title}`}
          </p>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {meta ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {meta}
          </div>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsItem({
  title,
  description,
  meta,
  children,
  className,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-setting-item
      className={cn(
        "grid min-w-0 gap-3 border-b border-border py-4 sm:py-5 lg:grid-cols-[minmax(170px,0.31fr)_minmax(0,1fr)] lg:items-start lg:gap-7",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold leading-5 text-foreground">{title}</h3>
          {meta}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
