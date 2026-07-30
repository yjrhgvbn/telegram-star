import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Link2,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Filter, ForwardTarget, ForwardTargetCreateInput, ForwardTargetTestInput } from "@/types";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  FORWARD_FORMAT_PRESETS,
  FORWARD_TEMPLATE_SAMPLE_PAYLOAD,
  FORWARD_TEMPLATE_VARIABLES,
  renderForwardTemplate,
} from "@telegram-star/shared/contracts/forward-targets";
import { isDraftTarget, type EditableForwardTarget } from "../types";
import { RuleSubscriptionWorkbench } from "./RuleSubscriptionWorkbench";
import {
  maskAppriseUrl,
  TargetInspector,
  type TargetEditorTask,
} from "./TargetInspector";

function resolveTemplateValue(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized ? normalized : fallback;
}

function sortIds(ids: number[]): number[] {
  return [...ids].sort((left, right) => left - right);
}

function taskTriggerClass(selected: boolean): string {
  return cn(
    "h-8 flex-none rounded-lg px-3 text-xs font-semibold transition-none active:scale-[0.98] sm:px-4",
    selected
      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary data-active:bg-primary data-active:text-primary-foreground"
      : "bg-transparent text-muted-foreground shadow-none hover:bg-card/70 hover:text-foreground data-active:bg-transparent data-active:text-muted-foreground data-active:shadow-none",
  );
}

export function TargetEditor({
  target,
  allFilters,
  onBack,
  onDraftChange,
  onSave,
  onDelete,
  onTest,
}: {
  target: EditableForwardTarget;
  allFilters: Filter[];
  onBack?: () => void;
  onDraftChange: (target: EditableForwardTarget | null) => void;
  onSave: (target: EditableForwardTarget, data: ForwardTargetCreateInput) => Promise<ForwardTarget>;
  onDelete: (target: EditableForwardTarget) => Promise<void>;
  onTest: (data: ForwardTargetTestInput) => Promise<unknown>;
}) {
  const isNew = isDraftTarget(target);
  const [activeTask, setActiveTask] = useState<TargetEditorTask>(
    isNew ? "connection" : "rules",
  );
  // Keep the selected tab visually immediate while a potentially large rule panel
  // renders at lower priority.
  const renderedTask = useDeferredValue(activeTask);
  const [name, setName] = useState(target.name);
  const [appriseUrl, setAppriseUrl] = useState(target.appriseUrl);
  const [enabled, setEnabled] = useState(target.enabled);
  const [filterIds, setFilterIds] = useState<number[]>(target.filterIds);
  const [titleTemplate, setTitleTemplate] = useState(
    target.titleTemplate || DEFAULT_FORWARD_TITLE_TEMPLATE,
  );
  const [bodyTemplate, setBodyTemplate] = useState(
    target.bodyTemplate || DEFAULT_FORWARD_BODY_TEMPLATE,
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const invalid = !name.trim() || !appriseUrl.trim();
  const effectiveTitleTemplate = resolveTemplateValue(titleTemplate, DEFAULT_FORWARD_TITLE_TEMPLATE);
  const effectiveBodyTemplate = resolveTemplateValue(bodyTemplate, DEFAULT_FORWARD_BODY_TEMPLATE);
  const activePreset = useMemo(
    () =>
      FORWARD_FORMAT_PRESETS.find(
        (preset) =>
          preset.titleTemplate === effectiveTitleTemplate &&
          preset.bodyTemplate === effectiveBodyTemplate,
      ) ?? null,
    [effectiveBodyTemplate, effectiveTitleTemplate],
  );
  const preview = useMemo(
    () => ({
      title: renderForwardTemplate(effectiveTitleTemplate, FORWARD_TEMPLATE_SAMPLE_PAYLOAD),
      body: renderForwardTemplate(effectiveBodyTemplate, FORWARD_TEMPLATE_SAMPLE_PAYLOAD),
    }),
    [effectiveBodyTemplate, effectiveTitleTemplate],
  );
  const selectedFilters = useMemo(() => {
    const selectedIds = new Set(filterIds);
    return allFilters.filter((filter) => selectedIds.has(filter.id));
  }, [allFilters, filterIds]);
  const isDirty =
    isNew ||
    name !== target.name ||
    appriseUrl !== target.appriseUrl ||
    enabled !== target.enabled ||
    titleTemplate !== (target.titleTemplate || DEFAULT_FORWARD_TITLE_TEMPLATE) ||
    bodyTemplate !== (target.bodyTemplate || DEFAULT_FORWARD_BODY_TEMPLATE) ||
    JSON.stringify(sortIds(filterIds)) !== JSON.stringify(sortIds(target.filterIds));

  const syncDraft = useCallback(
    (patch: Partial<ForwardTargetCreateInput>) => {
      if (!isNew) return;
      onDraftChange({
        id: 0,
        name,
        appriseUrl,
        enabled,
        filterIds,
        titleTemplate,
        bodyTemplate,
        ...patch,
      });
    },
    [
      appriseUrl,
      bodyTemplate,
      enabled,
      filterIds,
      isNew,
      name,
      onDraftChange,
      titleTemplate,
    ],
  );

  const handleNameChange = (value: string) => {
    setName(value);
    syncDraft({ name: value });
  };

  const handleUrlChange = (value: string) => {
    setAppriseUrl(value);
    syncDraft({ appriseUrl: value });
  };

  const handleEnabledChange = () => {
    setEnabled((current) => {
      const next = !current;
      syncDraft({ enabled: next });
      return next;
    });
  };

  const handleFilterIdsChange = useCallback(
    (next: number[]) => {
      setFilterIds(next);
      syncDraft({ filterIds: next });
    },
    [syncDraft],
  );

  const handleToggleFilter = useCallback(
    (filterId: number) => {
      handleFilterIdsChange(
        filterIds.includes(filterId)
          ? filterIds.filter((id) => id !== filterId)
          : [...filterIds, filterId],
      );
    },
    [filterIds, handleFilterIdsChange],
  );

  const handleTitleTemplateChange = (value: string) => {
    setTitleTemplate(value);
    syncDraft({ titleTemplate: value });
  };

  const handleBodyTemplateChange = (value: string) => {
    setBodyTemplate(value);
    syncDraft({ bodyTemplate: value });
  };

  const handleApplyPreset = (preset: (typeof FORWARD_FORMAT_PRESETS)[number]) => {
    setTitleTemplate(preset.titleTemplate);
    setBodyTemplate(preset.bodyTemplate);
    syncDraft({
      titleTemplate: preset.titleTemplate,
      bodyTemplate: preset.bodyTemplate,
    });
  };

  const handleAppendVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const next = bodyTemplate.trim() ? `${bodyTemplate}\n${token}` : token;
    setBodyTemplate(next);
    syncDraft({ bodyTemplate: next });
  };

  const handleSave = async () => {
    try {
      if (invalid) {
        setActiveTask("connection");
        throw new Error("请先填写通道名称和 Apprise URL");
      }

      setSaving(true);
      setError(null);
      setNotice(null);
      setDeleteConfirming(false);

      await onSave(target, {
        name: name.trim(),
        appriseUrl: appriseUrl.trim(),
        enabled,
        filterIds,
        titleTemplate: titleTemplate.trim(),
        bodyTemplate: bodyTemplate.trim(),
      });
      setNotice("更改已保存");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      if (!appriseUrl.trim()) {
        setActiveTask("connection");
        throw new Error("请先填写 Apprise URL");
      }

      setTesting(true);
      setError(null);
      setNotice(null);
      setDeleteConfirming(false);
      await onTest({
        appriseUrl: appriseUrl.trim(),
        titleTemplate: titleTemplate.trim(),
        bodyTemplate: bodyTemplate.trim(),
      });
      setNotice("测试消息已发送");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "测试发送失败");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) {
      onDraftChange(null);
      await onDelete(target);
      return;
    }
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      setError(null);
      setNotice(null);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await onDelete(target);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
      setSaving(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 bg-card xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={onBack}
              aria-label="返回通道列表"
            >
              <ArrowLeft />
            </Button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-base font-semibold sm:text-lg">
                {name.trim() || (isNew ? "新建通道" : "未命名通道")}
              </h2>
              <Badge
                variant={invalid ? "destructive" : enabled ? "secondary" : "outline"}
                className="hidden sm:inline-flex"
              >
                {invalid ? "待完善" : enabled ? "已启用" : "已停用"}
              </Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground sm:text-xs">
              {appriseUrl.trim()
                ? maskAppriseUrl(appriseUrl)
                : "填写 Apprise URL 以连接目标服务"}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="通道状态"
            className={cn(
              "flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
              enabled ? "bg-primary" : "bg-muted-foreground/28",
            )}
            onClick={handleEnabledChange}
          >
            <span
              className={cn(
                "size-6 rounded-full bg-card shadow-sm transition-transform",
                enabled && "translate-x-5",
              )}
            />
          </button>
        </header>

        <Tabs
          value={renderedTask}
          onValueChange={(value) => setActiveTask(value as TargetEditorTask)}
          className="flex min-h-0 flex-1 gap-0"
        >
          <div className="flex h-14 shrink-0 items-center border-b bg-card px-3 sm:px-5">
            <TabsList
              className="max-w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:none] group-data-horizontal/tabs:h-10 [&::-webkit-scrollbar]:hidden"
              aria-label="通道配置任务"
            >
              <TabsTrigger
                value="connection"
                className={taskTriggerClass(activeTask === "connection")}
                onPointerDown={() => setActiveTask("connection")}
                onClick={() => setActiveTask("connection")}
              >
                <Link2 data-icon="inline-start" className="size-3.5" />
                连接
              </TabsTrigger>
              <TabsTrigger
                value="template"
                className={taskTriggerClass(activeTask === "template")}
                onPointerDown={() => setActiveTask("template")}
                onClick={() => setActiveTask("template")}
              >
                <MessageSquareText data-icon="inline-start" className="size-3.5" />
                消息模板
              </TabsTrigger>
              <TabsTrigger
                value="rules"
                className={taskTriggerClass(activeTask === "rules")}
                onPointerDown={() => setActiveTask("rules")}
                onClick={() => setActiveTask("rules")}
              >
                <ListChecks data-icon="inline-start" className="size-3.5" />
                订阅规则
                <span className="grid min-w-5 place-items-center rounded-full bg-card/90 px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border)_65%,transparent)]">
                  {filterIds.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {(error || notice) && (
            <div
              role="status"
              className={cn(
                "mx-3 mt-3 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm sm:mx-4",
                error
                  ? "bg-destructive/10 text-destructive"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {error ? (
                <AlertCircle className="size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0" />
              )}
              <span>{error || notice}</span>
            </div>
          )}

          <TabsContent value="connection" className="min-h-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 pb-8 sm:p-6">
              <div>
                <h3 className="text-base font-semibold">连接与状态</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  设置这个通道如何抵达目标服务。通道标题和地址会即时同步到顶部摘要。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="forward-target-name">
                    通道名称
                  </label>
                  <Input
                    id="forward-target-name"
                    value={name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    placeholder="例如：研发群 / 飞书值班群"
                    className="h-10 bg-background"
                    aria-invalid={!name.trim()}
                  />
                </div>

                <button
                  type="button"
                  className="flex min-h-10 items-center justify-between gap-3 self-end rounded-lg border bg-muted/34 px-3 text-left transition-colors hover:bg-muted/58"
                  onClick={handleEnabledChange}
                  aria-label={enabled ? "停用当前通道" : "启用当前通道"}
                >
                  <span>
                    <span className="block text-sm font-medium">运行状态</span>
                    <span className="block text-xs text-muted-foreground">
                      {enabled ? "接收匹配消息" : "暂停消息转发"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      enabled ? "bg-success" : "bg-muted-foreground/45",
                    )}
                  />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="forward-apprise-url">
                  Apprise URL
                </label>
                <Input
                  id="forward-apprise-url"
                  value={appriseUrl}
                  onChange={(event) => handleUrlChange(event.target.value)}
                  placeholder="dingtalk://Token / discord://ID/Token"
                  className="h-10 bg-background font-mono text-xs"
                  aria-invalid={!appriseUrl.trim()}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  支持 Apprise 协议地址；保存前可使用底部“发送测试”验证连通性。
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="template" className="min-h-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 pb-8 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">编排抵达时的消息</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    先选择内容密度，再微调模板；桌面右侧检视器会即时展示最终效果。
                  </p>
                </div>
                <Badge variant="outline" className="mt-0.5 rounded-md">
                  {activePreset?.name ?? "自定义"}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="格式预设">
                {FORWARD_FORMAT_PRESETS.map((preset) => {
                  const active = activePreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={cn(
                        "flex min-h-16 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-primary/45 bg-secondary text-foreground shadow-sm"
                          : "bg-card text-muted-foreground hover:bg-muted/45 hover:text-foreground",
                      )}
                      onClick={() => handleApplyPreset(preset)}
                    >
                      <span className="text-sm font-semibold">{preset.name}</span>
                      <span className="mt-0.5 text-xs">
                        {preset.id === "compact"
                          ? "标题优先，适合高频通知"
                          : preset.id === "detailed"
                            ? "保留来源、发送者与时间"
                            : "结构化强调与链接"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="forward-title-template">
                  标题模板
                </label>
                <Input
                  id="forward-title-template"
                  value={titleTemplate}
                  onChange={(event) => handleTitleTemplateChange(event.target.value)}
                  placeholder={DEFAULT_FORWARD_TITLE_TEMPLATE}
                  className="h-10 bg-background font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="forward-body-template">
                  正文模板
                </label>
                <Textarea
                  id="forward-body-template"
                  value={bodyTemplate}
                  onChange={(event) => handleBodyTemplateChange(event.target.value)}
                  placeholder={DEFAULT_FORWARD_BODY_TEMPLATE}
                  className="min-h-40 bg-background font-mono text-xs leading-6"
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">插入变量</span>
                <div className="flex flex-wrap gap-1.5">
                  {FORWARD_TEMPLATE_VARIABLES.map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      className="rounded-md border bg-card px-2 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-input hover:bg-muted hover:text-foreground"
                      onClick={() => handleAppendVariable(variable)}
                    >
                      {`{{${variable}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/28 p-3 xl:hidden">
                <div className="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">
                  消息预览
                </div>
                <div className="break-words text-sm font-semibold">{preview.title}</div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-muted-foreground">
                  {preview.body}
                </pre>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rules" className="flex min-h-0">
            <RuleSubscriptionWorkbench
              allFilters={allFilters}
              selectedFilterIds={filterIds}
              onSelectedFilterIdsChange={handleFilterIdsChange}
            />
          </TabsContent>
        </Tabs>

        <footer className="flex h-15 shrink-0 items-center justify-between gap-2 border-t bg-card/95 px-2.5 shadow-[0_-8px_24px_color-mix(in_oklab,var(--foreground)_4%,transparent)] backdrop-blur-md sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant={deleteConfirming ? "destructive" : "ghost"}
              size={deleteConfirming ? "sm" : "icon"}
              onClick={handleDelete}
              disabled={saving || testing}
              aria-label={
                isNew
                  ? "放弃新建通道"
                  : deleteConfirming
                    ? "确认删除通道"
                    : "删除通道"
              }
              className={cn(
                !deleteConfirming && "text-destructive hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2 data-icon={deleteConfirming ? "inline-start" : undefined} />
              {deleteConfirming ? "确认删除" : null}
            </Button>
            {deleteConfirming ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirming(false)}
              >
                取消
              </Button>
            ) : null}
            <span className="hidden truncate text-xs text-muted-foreground sm:block">
              {isDirty ? "尚有未保存更改" : "所有更改已保存"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="default"
              variant="outline"
              onClick={handleTest}
              disabled={saving || testing}
            >
              {testing ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Send data-icon="inline-start" />
              )}
              发送测试
            </Button>
            <Button
              type="button"
              size="default"
              onClick={handleSave}
              disabled={saving || testing}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              保存更改
            </Button>
          </div>
        </footer>
      </section>

      <TargetInspector
        task={renderedTask}
        filters={selectedFilters}
        totalFilterCount={allFilters.length}
        name={name}
        appriseUrl={appriseUrl}
        enabled={enabled}
        invalid={invalid}
        preview={preview}
        onRemoveFilter={handleToggleFilter}
      />
    </div>
  );
}
