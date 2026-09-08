import type { ReactNode } from "react";
import { ChevronDown, LoaderCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ForwardTarget, JoinedChat } from "@/types";
import type { DraftCondition } from "../types";
import { groupDraftConditions } from "../utils";
import { ConditionGroupEditor } from "./ConditionGroupEditor";
import "./FilterForm.css";

interface FilterFormProps {
  autoLocateUnreadNearRead: boolean;
  onAutoLocateChange: (value: boolean) => void;
  chats: JoinedChat[];
  chatsLoading: boolean;
  forwardTargets: ForwardTarget[];
  selectedForwardTargetIds: number[];
  forwardTargetsLoading: boolean;
  onToggleForwardTarget: (id: number) => void;
  onCreateForwardTarget: () => void;
  conditions: DraftCondition[];
  onUpdateCondition: (
    id: string,
    updater: (condition: DraftCondition) => DraftCondition,
  ) => void;
  onRemoveCondition: (id: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onToggleGroupEffect: (groupId: string) => void;
  onAppendValues: (id: string) => void;
  onAddAlternative: (groupId: string) => void;
  onAddCondition: () => void;
  onAddExclusion?: () => void;
  historyBackfill?: ReactNode;
}

export function FilterForm({
  autoLocateUnreadNearRead,
  onAutoLocateChange,
  chats,
  chatsLoading,
  forwardTargets,
  selectedForwardTargetIds,
  forwardTargetsLoading,
  onToggleForwardTarget,
  onCreateForwardTarget,
  conditions,
  onUpdateCondition,
  onRemoveCondition,
  onRemoveGroup,
  onToggleGroupEffect,
  onAppendValues,
  onAddAlternative,
  onAddCondition,
  onAddExclusion,
  historyBackfill,
}: FilterFormProps) {
  // Source groups stay first; content groups retain their original AND/OR scope and order.
  const visibleGroups = [...groupDraftConditions(conditions)].sort(
    (a, b) =>
      Number(b.conditions.every((condition) => condition.type === "chat")) -
      Number(a.conditions.every((condition) => condition.type === "chat")),
  );
  const primaryChatGroupId = visibleGroups.find((group) =>
    group.conditions.every((condition) => condition.type === "chat"),
  )?.id;
  const selectedTargets = forwardTargets.filter((target) =>
    selectedForwardTargetIds.includes(target.id),
  );
  const notifySummary = selectedTargets.length
    ? selectedTargets.map((target) => target.name).join("、")
    : "不发送通知";
  const pausedTargets = selectedTargets.filter((target) => !target.enabled);

  return (
    <div className="rule-form">
      <section id="conditions" aria-label="匹配条件" className="rule-form__conditions">
        <h2>匹配条件</h2>
        <div className="rule-form__groups">
          {visibleGroups.map((group, index) => (
            <ConditionGroupEditor
              key={group.id}
              group={group}
              index={index}
              chats={chats}
              chatsLoading={chatsLoading}
              removable={group.id !== primaryChatGroupId}
              onUpdateCondition={onUpdateCondition}
              onRemoveCondition={onRemoveCondition}
              onRemoveGroup={onRemoveGroup}
              onToggleEffect={onToggleGroupEffect}
              onAppendValues={onAppendValues}
              onAddAlternative={onAddAlternative}
            />
          ))}
        </div>
        <div className="rule-form__add-actions">
          <Button type="button" variant="ghost" size="sm" onClick={onAddCondition}>
            <Plus data-icon="inline-start" />
            添加条件组
          </Button>
          {onAddExclusion ? (
            <Button type="button" variant="ghost" size="sm" onClick={onAddExclusion}>
              <Plus data-icon="inline-start" />
              添加排除组
            </Button>
          ) : null}
        </div>
      </section>

      <div className="rule-form__settings">
        <details className="rule-setting" id="actions">
          <summary>
            <span>命中后通知</span>
            <span className="rule-setting__value">
              {forwardTargetsLoading ? "读取中…" : notifySummary}
            </span>
            {pausedTargets.length ? (
              <Badge variant="secondary">
                {pausedTargets.length === selectedTargets.length ? "已停用" : "部分停用"}
              </Badge>
            ) : null}
            <ChevronDown aria-hidden />
          </summary>
          <div className="rule-setting__body">
            {forwardTargetsLoading ? (
              <p className="rule-setting__loading">
                <LoaderCircle className="size-4 animate-spin" />
                读取通知通道中…
              </p>
            ) : forwardTargets.length === 0 ? (
              <Button variant="outline" size="sm" onClick={onCreateForwardTarget}>
                <Plus data-icon="inline-start" />
                新建通道
              </Button>
            ) : (
              <div className="rule-notification-options">
                {forwardTargets.map((target) => (
                  <label key={target.id}>
                    <input
                      type="checkbox"
                      checked={selectedForwardTargetIds.includes(target.id)}
                      onChange={() => onToggleForwardTarget(target.id)}
                      aria-label={target.name}
                    />
                    <span>{target.name}</span>
                    {!target.enabled ? <Badge variant="secondary">已停用</Badge> : null}
                  </label>
                ))}
              </div>
            )}
            {pausedTargets.length ? (
              <p className="rule-setting__note">
                {pausedTargets.map((target) => target.name).join("、")}已停用，暂不会发送通知。
              </p>
            ) : null}
          </div>
        </details>
        <details className="rule-setting">
          <summary>
            <span>打开消息时</span>
            <span className="rule-setting__value">
              {autoLocateUnreadNearRead ? "定位待完成" : "按浏览位置"}
            </span>
            <ChevronDown aria-hidden />
          </summary>
          <div className="rule-setting__body rule-setting__toggle">
            <label htmlFor="rule-auto-locate">自动定位待完成</label>
            <Switch
              id="rule-auto-locate"
              checked={autoLocateUnreadNearRead}
              onCheckedChange={onAutoLocateChange}
              aria-label="打开时自动定位待完成"
            />
          </div>
        </details>
        {historyBackfill}
      </div>
      <p className="rule-form__impact">保存条件会重算当前规则的历史消息，移除不再命中的内容；其他规则的收录不受影响。</p>
    </div>
  );
}
