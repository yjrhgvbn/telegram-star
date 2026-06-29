import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function SettingRow({
  icon: Icon,
  title,
  meta,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-lg bg-background/65 p-3 ring-1 ring-foreground/10 lg:grid-cols-[210px_minmax(0,760px)]">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-6 text-foreground">{title}</h2>
            {meta}
          </div>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
