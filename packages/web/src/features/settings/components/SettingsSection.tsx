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
    <section className="min-w-0 rounded-lg bg-card/72 p-3 text-card-foreground shadow-[0_24px_70px_color-mix(in_oklab,var(--foreground)_8%,transparent)] backdrop-blur">
      <header className="flex min-w-0 flex-col gap-2 px-1 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
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
      <div className="flex min-w-0 flex-col gap-2.5">{children}</div>
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
        "grid min-w-0 gap-3 rounded-lg bg-muted/38 px-3 py-3 lg:grid-cols-[minmax(150px,0.3fr)_minmax(0,1fr)] lg:items-start",
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
