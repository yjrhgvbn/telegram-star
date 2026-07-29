import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  icon: Icon,
  title,
  description,
  meta,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border/72 bg-card/88 text-card-foreground shadow-sm">
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
            {description && (
              <p className="text-xs leading-4 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {meta && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{meta}</div>}
      </header>
      <div className="flex min-w-0 flex-col gap-2 p-3">{children}</div>
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
        "grid min-w-0 gap-3 rounded-lg border border-border/65 bg-muted/30 px-3 py-2.5 lg:grid-cols-[minmax(150px,0.3fr)_minmax(0,1fr)] lg:items-start",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium leading-5 text-foreground">{title}</h3>
          {meta}
        </div>
        {description && (
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
