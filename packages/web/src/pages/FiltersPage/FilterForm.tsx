import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Filter } from "@/types";
import { ConditionEditor } from "./ConditionEditor";
import type { DraftCondition } from "./types";

interface FilterFormProps {
  selectedFilter: Filter | null;
  name: string;
  onNameChange: (name: string) => void;
  autoLocateUnreadNearRead: boolean;
  onAutoLocateChange: (value: boolean) => void;
  conditions: DraftCondition[];
  error: string;
  saving: boolean;
  onUpdateCondition: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemoveCondition: (id: string) => void;
  onAppendKeywords: (id: string) => void;
  onAddCondition: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

export function FilterForm({
  selectedFilter,
  name,
  onNameChange,
  autoLocateUnreadNearRead,
  onAutoLocateChange,
  conditions,
  error,
  saving,
  onUpdateCondition,
  onRemoveCondition,
  onAppendKeywords,
  onAddCondition,
  onSave,
  onDelete,
  onToggle,
}: FilterFormProps) {
  return (
    <Card className="border border-border/70 bg-card/70" size="sm">
      <CardHeader className="pt-2 pb-2">
        <CardTitle>
          {selectedFilter ? `编辑过滤器：${selectedFilter.name}` : "新建过滤器"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">过滤器名称</label>
          <Input
            placeholder="例如：BTC 讨论 / Solana 频道观察"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-xs sm:text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={autoLocateUnreadNearRead}
            onChange={(event) => onAutoLocateChange(event.target.checked)}
          />
          自动定位到最近已读相邻的未读消息
        </label>

        <div className="space-y-1.5">
          {conditions.map((condition) => (
            <ConditionEditor
              key={condition.id}
              condition={condition}
              onUpdate={onUpdateCondition}
              onRemove={onRemoveCondition}
              onAppendKeywords={onAppendKeywords}
            />
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAddCondition}>
          <Plus data-icon="inline-start" />
          增加一个条件
        </Button>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {selectedFilter ? "保存修改" : "创建过滤器"}
          </Button>
          {selectedFilter && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onToggle}>
                {selectedFilter.enabled ? "停用过滤器" : "启用过滤器"}
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
                <Trash2 data-icon="inline-start" />
                删除
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
