import { memo } from "react";
import { CheckCircle2, CircleAlert, Eye, Link2, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Filter } from "@/types";
import { cn } from "@/lib/utils";
import { SelectedRulesLedger } from "./RuleSubscriptionWorkbench";

export type TargetEditorTask = "connection" | "template" | "rules";

export function maskAppriseUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "尚未填写";

  const protocolIndex = normalized.indexOf("://");
  if (protocolIndex === -1) {
    return normalized.length > 10
      ? `${normalized.slice(0, 6)}••••${normalized.slice(-3)}`
      : "••••••••";
  }

  const protocol = normalized.slice(0, protocolIndex + 3);
  const credential = normalized.slice(protocolIndex + 3);
  if (!credential) return protocol;
  if (credential.length <= 8) return `${protocol}••••••`;
  return `${protocol}${credential.slice(0, 5)}••••${credential.slice(-4)}`;
}

function InspectorHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center border-b bg-card px-4">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}

export const TargetInspector = memo(function TargetInspector({
  task,
  filters,
  totalFilterCount,
  name,
  appriseUrl,
  enabled,
  invalid,
  preview,
  onRemoveFilter,
}: {
  task: TargetEditorTask;
  filters: Filter[];
  totalFilterCount: number;
  name: string;
  appriseUrl: string;
  enabled: boolean;
  invalid: boolean;
  preview: { title: string; body: string };
  onRemoveFilter: (id: number) => void;
}) {
  if (task === "rules") {
    return (
      <aside className="hidden min-h-0 min-w-0 flex-col border-l bg-muted/26 xl:flex">
        <InspectorHeader title="已选规则" description="保存前核对订阅关系" />
        <div className="flex min-h-0 flex-1 p-3">
          <SelectedRulesLedger
            filters={filters}
            totalCount={totalFilterCount}
            onRemove={onRemoveFilter}
          />
        </div>
      </aside>
    );
  }

  if (task === "template") {
    return (
      <aside className="hidden min-h-0 min-w-0 flex-col border-l bg-muted/26 xl:flex">
        <InspectorHeader title="消息预览" description="使用示例消息实时渲染" />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="rounded-xl border bg-card p-4 shadow-[0_8px_24px_color-mix(in_oklab,var(--foreground)_6%,transparent)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                <Eye className="size-4" />
                Preview
              </span>
              <span className="size-2 rounded-full bg-success shadow-[0_0_0_4px_color-mix(in_oklab,var(--success)_12%,transparent)]" />
            </div>
            <div className="break-words text-sm font-semibold leading-6">{preview.title}</div>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-muted-foreground">
              {preview.body}
            </pre>
          </div>

          <div className="mt-3 rounded-lg border border-dashed bg-card/58 p-3 text-xs leading-5 text-muted-foreground">
            预览使用示例数据，不会发送真实通知。点击底部“发送测试”可验证目标服务。
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden min-h-0 min-w-0 flex-col border-l bg-muted/26 xl:flex">
      <InspectorHeader title="连接核对" description="保存前检查必要配置" />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="rounded-xl border bg-card p-4 shadow-[0_8px_24px_color-mix(in_oklab,var(--foreground)_6%,transparent)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="size-4 text-primary" />
              通道状态
            </span>
            <Badge variant={enabled ? "secondary" : "outline"}>
              {enabled ? "已启用" : "已停用"}
            </Badge>
          </div>

          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-3 border-b py-3 text-xs">
              <span className="text-muted-foreground">通道名称</span>
              <span className={cn("max-w-40 break-words text-right font-medium", !name.trim() && "text-destructive")}>
                {name.trim() || "尚未填写"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 border-b py-3 text-xs">
              <span className="shrink-0 text-muted-foreground">推送地址</span>
              <span
                className={cn(
                  "min-w-0 break-all text-right font-mono text-[11px]",
                  !appriseUrl.trim() && "text-destructive",
                )}
              >
                {maskAppriseUrl(appriseUrl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-3 text-xs">
              <span className="text-muted-foreground">配置检查</span>
              <span
                className={cn(
                  "flex items-center gap-1.5 font-medium",
                  invalid ? "text-destructive" : "text-success",
                )}
              >
                {invalid ? <CircleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                {invalid ? "需要完善" : "可以保存"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg border border-dashed bg-card/58 p-3 text-xs leading-5 text-muted-foreground">
          <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
          Apprise URL 只用于建立目标服务连接，页面摘要始终以脱敏形式展示。
        </div>
      </div>
    </aside>
  );
});
