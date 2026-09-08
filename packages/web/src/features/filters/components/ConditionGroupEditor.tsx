import { useLayoutEffect, useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowUpDown, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JoinedChat } from "@/types";
import type { DraftCondition, DraftConditionGroup } from "../types";
import { ConditionEditor } from "./ConditionEditor";
import "./RulesConditions.css";

interface ConditionGroupEditorProps {
  group: DraftConditionGroup;
  index: number;
  chats: JoinedChat[];
  chatsLoading: boolean;
  removable: boolean;
  onUpdateCondition: (
    id: string,
    updater: (condition: DraftCondition) => DraftCondition,
  ) => void;
  onRemoveCondition: (id: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onToggleEffect: (groupId: string) => void;
  onAppendValues: (id: string) => void;
  onAddAlternative: (groupId: string) => void;
}

export function ConditionGroupEditor({
  group,
  chats,
  chatsLoading,
  removable,
  onUpdateCondition,
  onRemoveCondition,
  onRemoveGroup,
  onToggleEffect,
  onAppendValues,
  onAddAlternative,
}: ConditionGroupEditorProps) {
  const groupRef = useRef<HTMLElement>(null);
  const previousIdsRef = useRef(group.conditions.map((condition) => condition.id));
  const pendingFocusRef = useRef<string | null>(null);
  const menuFocusRef = useRef<string | null>(null);
  const isChatGroup = group.conditions.every((condition) => condition.type === "chat");
  const isExcluded = group.effect === "exclude";
  const firstCondition = group.conditions[0];
  const effectToggleLabel = isExcluded
    ? "当前为整组排除，点击切换为必须满足"
    : "当前为必须满足，点击切换为整组排除";

  const findConditionInput = (id: string) => {
    const row = Array.from(
      groupRef.current?.querySelectorAll<HTMLElement>("[data-condition-id]") ?? [],
    ).find((element) => element.dataset.conditionId === id);
    // Base UI Select also renders a hidden input; target only the value editor.
    return row?.querySelector<HTMLElement>("input[data-slot='input'], textarea")
      ?? row?.querySelector<HTMLElement>("button");
  };

  useLayoutEffect(() => {
    const previousIds = previousIdsRef.current;
    const added = group.conditions.find((condition) => !previousIds.includes(condition.id));
    const focusId = pendingFocusRef.current ?? added?.id;
    if (focusId) findConditionInput(focusId)?.focus();
    pendingFocusRef.current = null;
    previousIdsRef.current = group.conditions.map((condition) => condition.id);
  }, [group.conditions]);

  const removeCondition = (id: string, fromMenu = false) => {
    const index = group.conditions.findIndex((condition) => condition.id === id);
    const next = group.conditions[index + 1] ?? group.conditions[index - 1];
    pendingFocusRef.current = next?.id ?? null;
    // Menu dismissal normally restores its trigger; a deleted row should instead
    // continue editing the surviving sibling selected above.
    if (fromMenu) menuFocusRef.current = next?.id ?? null;
    onRemoveCondition(id);
  };

  if (isChatGroup) {
    return (
      <section ref={groupRef} className="rules-condition-source" aria-label="消息来源" data-rule-group-id={group.id} tabIndex={-1}>
        <span className="rules-condition-source__label">消息来源</span>
        <div className="rules-condition-source__fields">
          {group.conditions.map((condition, conditionIndex) => (
            <div key={condition.id} className="rules-condition-source__item">
              {conditionIndex > 0 ? <span className="rules-condition-relation">或</span> : null}
              <ConditionEditor
                condition={condition}
                groupEffect={group.effect}
                chats={chats}
                chatsLoading={chatsLoading}
                removable={group.conditions.length > 1}
                onUpdate={onUpdateCondition}
                onRemove={removeCondition}
                onAppendValues={onAppendValues}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={groupRef}
      className={cn("rules-condition-group", isExcluded && "rules-condition-group--exclude")}
      aria-label={isExcluded ? "排除条件组" : "必须满足的条件组"}
      data-rule-group-id={group.id}
      tabIndex={-1}
    >
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="rules-condition-group__rail"
        aria-label={effectToggleLabel}
        aria-pressed={isExcluded}
        title={effectToggleLabel}
        onClick={() => onToggleEffect(group.id)}
      >
        <span>{isExcluded ? "排除" : "并且"}</span>
        <ArrowUpDown data-icon="inline-end" aria-hidden="true" />
      </Button>

      <div className="rules-condition-group__content">
        <div className="rules-condition-group__toolbar">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rules-condition-group__add"
            aria-label="添加条件"
            onClick={() => onAddAlternative(group.id)}
          >
            <Plus data-icon="inline-start" />条件
          </Button>
          {removable || group.conditions.length > 1 ? (
            <Menu.Root onOpenChange={(open) => { if (open) menuFocusRef.current = null; }}>
              <Menu.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rules-condition-group__more"
                    aria-label="条件组操作"
                  />
                }
              >
                <MoreHorizontal />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="rules-menu-positioner" align="end" sideOffset={5}>
                  <Menu.Popup
                    className="rules-theme rules-condition-menu"
                    finalFocus={() => menuFocusRef.current ? findConditionInput(menuFocusRef.current) : true}
                  >
                    <Menu.Group>
                      {group.conditions.length > 1 && firstCondition ? (
                        <Menu.Item onClick={() => removeCondition(firstCondition.id, true)}>
                          <X aria-hidden="true" />删除首项条件
                        </Menu.Item>
                      ) : null}
                      {removable ? (
                        <Menu.Item className="rules-condition-menu__danger" onClick={() => onRemoveGroup(group.id)}>
                          <Trash2 aria-hidden="true" />删除条件组
                        </Menu.Item>
                      ) : null}
                    </Menu.Group>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
        </div>

        <div className="rules-condition-group__body">
          {group.conditions.map((condition, conditionIndex) => (
            <div key={condition.id} className="rules-condition-line">
              <span className="rules-condition-relation" aria-hidden={conditionIndex === 0}>
                {conditionIndex > 0 ? "或" : null}
              </span>
              <ConditionEditor
                condition={condition}
                groupEffect={group.effect}
                chats={chats}
                chatsLoading={chatsLoading}
                removable={conditionIndex > 0}
                onUpdate={onUpdateCondition}
                onRemove={removeCondition}
                onAppendValues={onAppendValues}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
