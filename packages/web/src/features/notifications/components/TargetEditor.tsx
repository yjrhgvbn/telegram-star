import { useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  Filter,
  ForwardTarget,
  ForwardTargetCreateInput,
  ForwardTargetTestInput,
  JoinedChat,
} from "@/types";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  type ForwardFormatPreset,
} from "@telegram-star/shared/contracts/forward-targets";
import { isDraftTarget, type EditableForwardTarget } from "../types";
import { RuleSubscriptionWorkbench } from "./RuleSubscriptionWorkbench";
import { ForwardFormatEditor } from "./ForwardFormatEditor";
import "./TargetEditor.css";

function formValues(target: EditableForwardTarget): ForwardTargetCreateInput {
  return {
    name: target.name,
    appriseUrl: target.appriseUrl,
    enabled: target.enabled,
    filterIds: target.filterIds,
    titleTemplate: target.titleTemplate || DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: target.bodyTemplate || DEFAULT_FORWARD_BODY_TEMPLATE,
  };
}

function serializeForm(value: ForwardTargetCreateInput) {
  return JSON.stringify({
    ...value,
    filterIds: [...value.filterIds].sort((a, b) => a - b),
  });
}

export function TargetEditor({
  target,
  allFilters,
  chats,
  filtersLoading,
  filtersError,
  onRetryFilters,
  onBack,
  onDraftChange,
  onDirtyChange,
  onBusyChange,
  onSave,
  onDelete,
  onTest,
}: {
  target: EditableForwardTarget;
  allFilters: Filter[];
  chats?: JoinedChat[];
  filtersLoading?: boolean;
  filtersError?: string | null;
  onRetryFilters?: () => void;
  onBack?: () => void;
  onDraftChange: (target: EditableForwardTarget | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onSave: (
    target: EditableForwardTarget,
    data: ForwardTargetCreateInput,
  ) => Promise<ForwardTarget>;
  onDelete: (target: EditableForwardTarget) => Promise<void>;
  onTest: (data: ForwardTargetTestInput) => Promise<unknown>;
}) {
  const isNew = isDraftTarget(target);
  const [form, setForm] = useState(() => formValues(target));
  const [savedForm, setSavedForm] = useState(() => formValues(target));
  const [activeTask, setActiveTask] = useState("rules");
  const [editingName, setEditingName] = useState(isNew);
  const [operation, setOperation] = useState<"save" | "test" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState(false);
  const [confirmation, setConfirmation] = useState<"delete" | "reset" | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const nameBeforeEdit = useRef(form.name);
  const addressBeforeEdit = useRef(form.appriseUrl);
  const busy = operation !== null;
  const dirty = serializeForm(form) !== serializeForm(savedForm);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const updateForm = (patch: Partial<ForwardTargetCreateInput>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setNotice(null);
    if (isNew) onDraftChange({ id: 0, ...next });
  };

  const editName = () => {
    nameBeforeEdit.current = form.name;
    setEditingName(true);
  };

  const handleSave = async () => {
    if (busy || (!isNew && !dirty)) return;
    setValidation(true);
    setError(null);
    setNotice(null);
    if (!form.name.trim()) {
      setEditingName(true);
      setError("请填写通道名称");
      requestAnimationFrame(() => nameInput.current?.focus());
      return;
    }
    if (!form.appriseUrl.trim()) {
      setError("请填写 Apprise 地址");
      addressInput.current?.focus();
      return;
    }
    setOperation("save");
    try {
      const saved = await onSave(target, {
        ...form,
        name: form.name.trim(),
        appriseUrl: form.appriseUrl.trim(),
        titleTemplate: form.titleTemplate.trim(),
        bodyTemplate: form.bodyTemplate.trim(),
      });
      // Match the server's normalized defaults after saving so blank templates
      // don't leave the editor appearing dirty or diverge from the next reload.
      const next = formValues(saved);
      setForm(next);
      setSavedForm(next);
      setEditingName(false);
      setNotice("更改已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setOperation(null);
    }
  };

  const handleTest = async () => {
    setError(null);
    setNotice(null);
    if (!form.appriseUrl.trim()) {
      setValidation(true);
      setError("请填写 Apprise 地址");
      addressInput.current?.focus();
      return;
    }
    setOperation("test");
    try {
      await onTest({
        appriseUrl: form.appriseUrl.trim(),
        titleTemplate: form.titleTemplate.trim(),
        bodyTemplate: form.bodyTemplate.trim(),
      });
      setNotice("测试消息已发送");
    } catch (err) {
      setError(err instanceof Error ? err.message : "测试发送失败");
    } finally {
      setOperation(null);
    }
  };

  const handleConfirm = async () => {
    if (confirmation === "reset") {
      setForm(savedForm);
      if (isNew) onDraftChange({ id: 0, ...savedForm });
      setValidation(false);
      setError(null);
      setNotice(null);
      setConfirmation(null);
      return;
    }
    setOperation("delete");
    setError(null);
    try {
      await onDelete(target);
      setConfirmation(null);
    } catch (err) {
      setConfirmation(null);
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setOperation(null);
    }
  };

  return (
    <section className="forward-editor" aria-label="转发通道配置">
      <header className="forward-editor__header">
        {onBack ? (
          <Button
            variant="ghost"
            size="icon-lg"
            className="forward-editor__back"
            aria-label="返回通道列表"
            onClick={onBack}
            disabled={busy}
          >
            <ArrowLeft />
          </Button>
        ) : null}
        <div className="forward-editor__name">
          {editingName ? (
            <Input
              ref={nameInput}
              autoFocus
              value={form.name}
              aria-label="通道名称"
              placeholder="通道名称"
              disabled={busy}
              aria-invalid={validation && !form.name.trim()}
              onChange={(event) => updateForm({ name: event.target.value })}
              onBlur={() => {
                if (form.name.trim()) setEditingName(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  updateForm({ name: nameBeforeEdit.current });
                  setEditingName(false);
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <h1>
              <button
                type="button"
                onClick={editName}
                disabled={busy}
                aria-label="编辑通道名称"
              >
                {form.name.trim() || "新建通道"}
              </button>
            </h1>
          )}
        </div>
        {dirty ? <span className="forward-editor__draft">未保存</span> : null}
        <label className="forward-editor__enabled">
          <Switch
            checked={form.enabled}
            onCheckedChange={(enabled) => updateForm({ enabled })}
            disabled={busy}
            aria-label="启用通道"
          />
          <span className="forward-editor__enabled-label">
            {form.enabled ? "已启用" : "已停用"}
          </span>
        </label>
        <Button
          size="lg"
          className="forward-editor__save"
          onClick={() => void handleSave()}
          disabled={busy || (!isNew && !dirty)}
        >
          {operation === "save" ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : null}
          保存
        </Button>
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="更多通道操作"
                disabled={busy}
              />
            }
          >
            <MoreHorizontal />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              className="forward-theme forward-menu-positioner"
              sideOffset={6}
              align="end"
            >
              <Menu.Popup className="forward-menu">
                <Menu.Group>
                  <Menu.Item onClick={editName}>编辑名称</Menu.Item>
                  <Menu.Item disabled={!dirty} onClick={() => setConfirmation("reset")}>
                    <RotateCcw />
                    重置修改
                  </Menu.Item>
                  <Menu.Item
                    className="forward-menu__danger"
                    onClick={() => setConfirmation("delete")}
                  >
                    <Trash2 />
                    {isNew ? "放弃新建" : "删除通道"}
                  </Menu.Item>
                </Menu.Group>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </header>
      <div className="forward-editor__connection">
        <label htmlFor="forward-apprise-url">Apprise 地址</label>
        <Input
          ref={addressInput}
          id="forward-apprise-url"
          aria-label="Apprise 地址"
          value={form.appriseUrl}
          placeholder="粘贴 Apprise 地址"
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={validation && !form.appriseUrl.trim()}
          onFocus={() => {
            addressBeforeEdit.current = form.appriseUrl;
          }}
          onChange={(event) => updateForm({ appriseUrl: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              updateForm({ appriseUrl: addressBeforeEdit.current });
              event.currentTarget.blur();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <Button
          variant="ghost"
          onClick={() => void handleTest()}
          disabled={busy}
          className="forward-editor__test"
        >
          {operation === "test" ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : (
            <Send data-icon="inline-start" />
          )}
          发送测试
        </Button>
      </div>
      {error || notice ? (
        <div
          className="forward-editor__feedback"
          data-error={!!error || undefined}
          role={error ? "alert" : "status"}
        >
          {error ? <AlertCircle /> : <CheckCircle2 />}
          <span>{error || notice}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="关闭提示"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X />
          </Button>
        </div>
      ) : null}
      <Tabs
        value={activeTask}
        onValueChange={(value) => setActiveTask(String(value))}
        className="forward-editor__tabs"
      >
        <TabsList
          variant="line"
          className="forward-editor__tab-list"
          aria-label="通道配置"
        >
          <TabsTrigger value="rules">
            接收规则 <span>{form.filterIds.length}</span>
          </TabsTrigger>
          <TabsTrigger value="format">消息格式</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="forward-editor__panel">
          <RuleSubscriptionWorkbench
            disabled={busy}
            allFilters={allFilters}
            chats={chats}
            loading={filtersLoading}
            error={filtersError}
            onRetry={onRetryFilters}
            selectedFilterIds={form.filterIds}
            onSelectedFilterIdsChange={(filterIds) => {
              if (!busy) updateForm({ filterIds });
            }}
          />
        </TabsContent>
        <TabsContent value="format" className="forward-editor__panel">
          <ForwardFormatEditor
            titleTemplate={form.titleTemplate}
            bodyTemplate={form.bodyTemplate}
            onTitleTemplateChange={(titleTemplate) => updateForm({ titleTemplate })}
            onBodyTemplateChange={(bodyTemplate) => updateForm({ bodyTemplate })}
            onApplyPreset={(preset: ForwardFormatPreset) =>
              updateForm({
                titleTemplate: preset.titleTemplate,
                bodyTemplate: preset.bodyTemplate,
              })
            }
            disabled={busy}
          />
        </TabsContent>
      </Tabs>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <AlertDialogContent className="forward-theme" size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "reset"
                ? "重置未保存的修改？"
                : isNew
                  ? "放弃新建通道？"
                  : `删除通道“${form.name.trim()}”？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === "reset"
                ? "恢复到上次保存的配置。"
                : "此通道的配置将被移除，接收规则会保留。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant={confirmation === "delete" ? "destructive" : "default"}
              onClick={() => void handleConfirm()}
            >
              {confirmation === "reset"
                ? "重置修改"
                : isNew
                  ? "放弃新建"
                  : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
