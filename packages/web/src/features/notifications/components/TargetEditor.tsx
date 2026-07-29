import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function resolveTemplateValue(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized ? normalized : fallback;
}

export function TargetEditor({
  target,
  allFilters,
  onDraftChange,
  onSave,
  onDelete,
  onTest,
}: {
  target: EditableForwardTarget;
  allFilters: Filter[];
  onDraftChange: (target: EditableForwardTarget | null) => void;
  onSave: (target: EditableForwardTarget, data: ForwardTargetCreateInput) => Promise<ForwardTarget>;
  onDelete: (target: EditableForwardTarget) => Promise<void>;
  onTest: (data: ForwardTargetTestInput) => Promise<unknown>;
}) {
  const isNew = isDraftTarget(target);
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

  const syncDraft = (patch: Partial<ForwardTargetCreateInput>) => {
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
  };

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

  const handleToggleFilter = (filterId: number) => {
    setFilterIds((prev) => {
      const next = prev.includes(filterId) ? prev.filter((id) => id !== filterId) : [...prev, filterId];
      syncDraft({ filterIds: next });
      return next;
    });
  };

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
      if (invalid) throw new Error("名称和推送 URL 不能为空");

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      if (!appriseUrl.trim()) throw new Error("推送 URL 不能为空");

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
    <Card className={cn("bg-card/88", !enabled && "opacity-75")} size="sm">
      <CardHeader className="border-b px-3 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{isNew ? "新建通道" : "编辑通道"}</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {filterIds.length} 个订阅规则
            </div>
          </div>
          <Badge variant={invalid ? "destructive" : enabled ? "secondary" : "outline"}>
            {invalid ? "待完善" : enabled ? "已启用" : "已停用"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-3">
        {(error || notice) && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              error
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {error ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            <span>{error || notice}</span>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">通道名称</label>
            <Input
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="例如：研发群 / 飞书值班群"
              className="h-9 bg-background/76"
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className="flex items-center justify-between gap-3 rounded-lg bg-muted/42 px-3 py-2.5 text-left transition-colors hover:bg-muted/65 lg:self-end"
            onClick={handleEnabledChange}
          >
            <span className="text-sm font-medium">通道状态</span>
            <span
              className={cn(
                "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition",
                enabled ? "bg-primary" : "bg-muted-foreground/25",
              )}
            >
              <span className={cn("size-5 rounded-full bg-white shadow-sm transition", enabled && "translate-x-5")} />
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Apprise URL</label>
          <Input
            value={appriseUrl}
            onChange={(event) => handleUrlChange(event.target.value)}
            placeholder="dingtalk://Token / discord://ID/Token"
            className="h-9 bg-background/76"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg bg-muted/42 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">消息格式</span>
            <Badge variant="outline" className="rounded-md">
              {activePreset?.name ?? "自定义"}
            </Badge>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="格式预设">
            {FORWARD_FORMAT_PRESETS.map((preset) => {
              const active = activePreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={cn(
                    "rounded-md px-2.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => handleApplyPreset(preset)}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="forward-title-template">
                  标题模板
                </label>
                <Input
                  id="forward-title-template"
                  value={titleTemplate}
                  onChange={(event) => handleTitleTemplateChange(event.target.value)}
                  placeholder={DEFAULT_FORWARD_TITLE_TEMPLATE}
                  className="h-9 bg-background/76"
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
                  className="min-h-32 bg-background/76"
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">变量</span>
                <div className="flex flex-wrap gap-1.5">
                  {FORWARD_TEMPLATE_VARIABLES.map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      className="rounded-md bg-muted/55 px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      onClick={() => handleAppendVariable(variable)}
                    >
                      {`{{${variable}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-medium">消息预览</span>
              <div className="min-h-40 rounded-lg border border-border/72 bg-card/72 p-3">
                <div className="break-words text-sm font-medium text-foreground">{preview.title}</div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-muted-foreground">
                  {preview.body}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">订阅规则</span>
            <Badge variant="outline" className="rounded-md">
              {filterIds.length}
            </Badge>
          </div>
          <div className="flex min-h-9 flex-wrap gap-1.5">
            {allFilters.length === 0 ? (
              <span className="rounded-md bg-muted/55 px-2.5 py-1.5 text-xs text-muted-foreground">
                暂无可用过滤器
              </span>
            ) : (
              allFilters.map((filter) => {
                const checked = filterIds.includes(filter.id);
                return (
                  <button
                    key={filter.id}
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                      checked
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => handleToggleFilter(filter.id)}
                  >
                    {filter.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={deleteConfirming ? "destructive" : "ghost"}
              size={deleteConfirming ? "sm" : "icon-sm"}
              onClick={handleDelete}
              disabled={saving || testing}
              aria-label={isNew ? "放弃新建通道" : deleteConfirming ? "确认删除通道" : "删除通道"}
              className={cn(
                !deleteConfirming && "text-destructive hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2 data-icon={deleteConfirming ? "inline-start" : undefined} />
              {deleteConfirming ? "确认删除" : null}
            </Button>
            {deleteConfirming && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteConfirming(false)}>
                取消
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={handleTest} disabled={saving || testing}>
              {testing ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Send data-icon="inline-start" />
              )}
              测试
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving || testing}>
              {saving ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              保存
            </Button>
          </div>
      </CardFooter>
    </Card>
  );
}
