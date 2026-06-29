import {
  AlertCircle,
  CheckCircle2,
  Image,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MediaConfigStatus, TelegramConfigStatus } from "@telegram-star/shared/contracts/config";
import type {
  SettingsInvalidItem,
  SettingsInvalidItemKind,
  SettingsStatusSummary,
} from "../hooks/useSettingsForm";

const invalidItemIcons: Record<SettingsInvalidItemKind, LucideIcon> = {
  "telegram-api": KeyRound,
  "telegram-auth": ShieldAlert,
  media: Image,
};

function StatusIcon({ summary }: { summary: SettingsStatusSummary }) {
  if (summary.tone === "loading") {
    return <LoaderCircle className="size-4 animate-spin" />;
  }

  if (summary.tone === "valid") {
    return <CheckCircle2 className="size-4" />;
  }

  return <AlertCircle className="size-4" />;
}

export function SettingsStatusPanel({
  status,
  mediaStatus,
  apiId,
  thumbIndex,
  invalidItems,
  summary,
}: {
  status: TelegramConfigStatus | null;
  mediaStatus: MediaConfigStatus | null;
  apiId: string;
  thumbIndex: number;
  invalidItems: SettingsInvalidItem[];
  summary: SettingsStatusSummary;
}) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-3 rounded-lg p-4 ring-1 xl:self-start",
        summary.tone === "invalid"
          ? "bg-destructive/5 ring-destructive/15"
          : summary.tone === "valid"
            ? "bg-primary/5 ring-primary/15"
            : "bg-muted/55 ring-foreground/10",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            summary.tone === "invalid"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <StatusIcon summary={summary} />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">当前状态</div>
          <div className="mt-0.5 text-sm font-semibold text-foreground">{summary.title}</div>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-background/75 px-3 py-2 text-sm ring-1 ring-foreground/10">
          <span className="text-muted-foreground">API ID</span>
          <span className="font-medium">{(status?.apiId ?? apiId) || "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-background/75 px-3 py-2 text-sm ring-1 ring-foreground/10">
          <span className="text-muted-foreground">缩略图</span>
          <Badge variant="outline" className="h-6 rounded-md px-2">
            thumb {mediaStatus?.thumbIndex ?? thumbIndex}
          </Badge>
        </div>
      </div>

      {invalidItems.length > 0 && (
        <div className="grid gap-2">
          {invalidItems.map((item) => {
            const Icon = invalidItemIcons[item.kind];
            return (
              <div
                key={item.title}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm ring-1",
                  item.tone === "danger"
                    ? "bg-destructive/10 text-destructive ring-destructive/20"
                    : "bg-background/75 text-foreground ring-foreground/10",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-medium leading-5">{item.title}</span>
                  <span className="mt-0.5 block text-xs opacity-75">{item.detail}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
