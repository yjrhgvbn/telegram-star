import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface RuleOutlineProps {
  conditionCount: number;
  forwardTargetCount: number;
  previewCompleted: boolean;
  previewStale: boolean;
  className?: string;
}

type OutlineStep = {
  href: string;
  title: string;
  description: string;
  state: "done" | "active" | "pending";
};

export function RuleOutline({
  conditionCount,
  forwardTargetCount,
  previewCompleted,
  previewStale,
  className,
}: RuleOutlineProps) {
  const steps: OutlineStep[] = [
    {
      href: "#conditions",
      title: "收到消息",
      description: "监听已加入的会话",
      state: "done",
    },
    {
      href: "#conditions",
      title: "判断是否命中",
      description: `${conditionCount} 个条件 · 全部满足`,
      state: "active",
    },
    {
      href: "#actions",
      title: "执行动作",
      description: `保存 · 通知 ${forwardTargetCount} 个通道`,
      state: "done",
    },
    {
      href: "#test-workbench",
      title: "用历史消息测试",
      description: previewStale
        ? "规则已修改，待重测"
        : previewCompleted
          ? "当前草稿已经验证"
          : "使用当前草稿直接测试",
      state: previewCompleted && !previewStale ? "done" : "pending",
    },
  ];

  return (
    <aside
      className={cn(
        "min-h-0 w-[218px] shrink-0 flex-col border-r border-border bg-sidebar/74 px-2.5 py-3",
        className,
      )}
    >
      <div className="px-2 pb-2 text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
        规则执行路径
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label="规则执行路径"
      >
        <div className="relative flex w-full flex-col gap-1">
          <span
            className="pointer-events-none absolute top-[30px] bottom-[30px] left-[22px] z-0 w-px bg-input/80"
            aria-hidden
            data-rule-connector
          />
          {steps.map((step, index) => {
            const completed = step.state === "done";
            const active = step.state === "active";

            return (
              <a
                key={`${step.href}-${step.title}`}
                href={step.href}
                className={cn(
                  "relative grid min-h-15 grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left transition-colors",
                  active
                    ? "border-input bg-card text-foreground shadow-[0_5px_14px_rgba(36,68,59,0.05)]"
                    : "text-muted-foreground hover:bg-card/58 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative z-10 grid size-7 place-items-center rounded-full border border-input bg-card text-[11px] font-bold",
                    completed && "border-success/30 bg-secondary text-success",
                    active && "border-primary bg-primary text-primary-foreground",
                  )}
                  data-rule-marker
                >
                  {completed ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4">
                    {step.description}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </nav>

      <p className="mt-3 border-t border-border px-2 pt-3 text-[10px] leading-4 text-muted-foreground">
        每次修改条件后，旧测试结果会标记为过期；重新验证不会保存草稿。
      </p>
    </aside>
  );
}
