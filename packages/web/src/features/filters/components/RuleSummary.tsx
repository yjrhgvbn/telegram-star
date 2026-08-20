import { Badge } from "@/components/ui/badge";
import type { ForwardTarget, JoinedChat } from "@/types";
import type { DraftCondition } from "../types";
import {
  describeFilterCondition,
  mergePersistableConditions,
  normalizeConditions,
} from "../utils";

interface RuleSummaryProps {
  conditions: DraftCondition[];
  chats: JoinedChat[];
  forwardTargets: ForwardTarget[];
  selectedForwardTargetIds: number[];
}

type SummaryToken = {
  key: string;
  label: string;
  detail: string;
};

export function RuleSummary({
  conditions,
  chats,
  forwardTargets,
  selectedForwardTargetIds,
}: RuleSummaryProps) {
  const persistedConditions = mergePersistableConditions(normalizeConditions(conditions));
  const readableConditions = [...persistedConditions].sort(
    (a, b) => Number(b.type === "chat") - Number(a.type === "chat"),
  );
  const selectedTargetNames = forwardTargets
    .filter((target) => selectedForwardTargetIds.includes(target.id))
    .map((target) => target.name);

  const chatTitleById = new Map(chats.map((chat) => [chat.id, chat.title]));
  const conditionTokens: SummaryToken[] = readableConditions.map((condition, index) => {
    if (condition.type === "chat") {
      const names = condition.values.map((value) => chatTitleById.get(value) ?? value);
      return {
        key: `${condition.type}-${index}`,
        label: names.length === 1 ? `来源：${names[0]}` : `来源：${names.length} 个会话`,
        detail: describeFilterCondition(condition, chats),
      };
    }

    if (condition.type === "regex") {
      return {
        key: `${condition.type}-${index}`,
        label:
          condition.values.length === 1
            ? `${condition.effect === "exclude" ? "排除表达式" : "表达式"}：${condition.values[0]}`
            : `${condition.effect === "exclude" ? "排除表达式" : "表达式"}：${condition.values.length} 个`,
        detail: describeFilterCondition(condition, chats),
      };
    }

    if (condition.type === "script") {
      return {
        key: `${condition.type}-${index}`,
        label: condition.effect === "exclude" ? "代码：命中时排除" : "代码：自定义判断",
        detail: describeFilterCondition(condition, chats),
      };
    }

    return {
      key: `${condition.type}-${index}`,
      label:
        condition.values.length === 1
          ? `${condition.effect === "exclude" ? "排除词" : "关键词"}：${condition.values[0]}`
          : `${condition.effect === "exclude" ? "排除词" : "关键词"}：${condition.values.length} 个`,
      detail: describeFilterCondition(condition, chats),
    };
  });
  const visibleConditionTokens = conditionTokens.slice(0, 2);
  const hiddenConditionCount = conditionTokens.length - visibleConditionTokens.length;
  const notificationLabel =
    selectedTargetNames.length > 0
      ? `通知：${selectedTargetNames.length} 个通道`
      : "不发送通知";
  const notificationDetail =
    selectedTargetNames.length > 0
      ? `发送到：${selectedTargetNames.join("、")}`
      : "当前未选择通知通道";

  return (
    <section
      id="rule-summary"
      aria-labelledby="rule-summary-title"
      className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/42 p-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="rule-summary-title" className="text-xs font-semibold">
            规则速览
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            系统会按下面的“如果 / 那么”关系处理消息
          </p>
        </div>
        <Badge variant="outline">全部满足</Badge>
      </header>

      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="grid h-9 grid-cols-[42px_minmax(0,1fr)] items-center gap-2 rounded-lg bg-card px-2">
          <Badge variant="secondary" className="justify-self-start rounded-md">
            如果
          </Badge>
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {visibleConditionTokens.length > 0 ? (
              visibleConditionTokens.map((token) => (
                <Badge
                  key={token.key}
                  variant="outline"
                  className="min-w-0 max-w-64 shrink"
                  title={token.detail}
                  aria-label={token.detail}
                >
                  <span className="truncate">{token.label}</span>
                </Badge>
              ))
            ) : (
              <span className="truncate text-[11px] text-muted-foreground">
                尚未配置完整条件
              </span>
            )}
            {hiddenConditionCount > 0 ? (
              <Badge variant="outline">+{hiddenConditionCount} 个条件</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid h-9 grid-cols-[42px_minmax(0,1fr)] items-center gap-2 rounded-lg bg-card px-2">
          <Badge variant="secondary" className="justify-self-start rounded-md">
            那么
          </Badge>
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <Badge variant="outline">保存消息</Badge>
            <Badge
              variant={selectedTargetNames.length > 0 ? "secondary" : "outline"}
              className="min-w-0 max-w-64 shrink"
              title={notificationDetail}
              aria-label={notificationDetail}
            >
              <span className="truncate">{notificationLabel}</span>
            </Badge>
          </div>
        </div>
      </div>
    </section>
  );
}
