import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import type { Filter } from "@/types";

interface ForwardTarget {
  id: number;
  name: string;
  appriseUrl: string;
  enabled: boolean;
  filterIds: number[];
}

const createDraftTarget = (): ForwardTarget => ({
  id: 0,
  name: "",
  appriseUrl: "",
  enabled: true,
  filterIds: [],
});

export function NotificationsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters } = useFilters();

  const [targets, setTargets] = useState<ForwardTarget[]>([]);
  const [draftTarget, setDraftTarget] = useState<ForwardTarget | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTargets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.forwardTargets.list();
      setTargets(data);
    } catch (err: any) {
      setError(err.message || "加载通知通道失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    if (selectedTargetId === "new" && draftTarget) return;
    if (selectedTargetId && targets.some((target) => String(target.id) === selectedTargetId)) return;
    if (draftTarget) {
      setSelectedTargetId("new");
      return;
    }
    setSelectedTargetId(targets[0] ? String(targets[0].id) : null);
  }, [draftTarget, selectedTargetId, targets]);

  const visibleTargets = draftTarget ? [draftTarget, ...targets] : targets;
  const selectedTarget =
    selectedTargetId === "new"
      ? draftTarget
      : targets.find((target) => String(target.id) === selectedTargetId) ?? null;

  const enabledTargets = targets.filter((target) => target.enabled).length;
  const subscribedRules = useMemo(
    () => new Set(targets.flatMap((target) => target.filterIds)).size,
    [targets],
  );

  const handleAdd = () => {
    if (!draftTarget) {
      setDraftTarget(createDraftTarget());
    }
    setSelectedTargetId("new");
  };

  const handleSaved = (savedTarget: ForwardTarget) => {
    setDraftTarget(null);
    setSelectedTargetId(String(savedTarget.id));
    void loadTargets();
  };

  const handleDeleted = (deletedTarget: ForwardTarget) => {
    if (deletedTarget.id === 0) {
      setDraftTarget(null);
      setSelectedTargetId(targets[0] ? String(targets[0].id) : null);
      return;
    }
    setSelectedTargetId(null);
    void loadTargets();
  };

  return (
    <AppShell
      activeTab="notifications"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto px-3 py-3 sm:px-4 lg:px-5">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
            <header className="rounded-lg bg-card/80 p-4 shadow-sm ring-1 ring-foreground/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <BellRing className="size-4" />
                    通知转发
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                    转发通道
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-7 gap-1.5 rounded-lg px-2.5">
                    <Webhook className="size-3.5" />
                    {targets.length} 个通道
                  </Badge>
                  <Badge variant="secondary" className="h-7 gap-1.5 rounded-lg px-2.5">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {enabledTargets} 个启用
                  </Badge>
                  <Badge variant="outline" className="h-7 rounded-lg px-2.5">
                    {subscribedRules} 个规则
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={loadTargets} disabled={loading}>
                    <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
                    刷新
                  </Button>
                  <Button type="button" size="sm" onClick={handleAdd}>
                    <Plus data-icon="inline-start" />
                    新建
                  </Button>
                </div>
              </div>
            </header>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="min-w-0">
                <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
                  <CardHeader className="px-3 pt-3 pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-sm">通道列表</CardTitle>
                      <Badge variant="outline" className="rounded-md">
                        {visibleTargets.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1.5 px-3 pb-3">
                    {loading && visibleTargets.length === 0 ? (
                      <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" />
                        读取通道中
                      </div>
                    ) : visibleTargets.length === 0 ? (
                      <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg bg-background/70 px-3 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
                        <Inbox className="size-6 text-muted-foreground/70" />
                        当前没有转发通道
                        <Button type="button" size="sm" onClick={handleAdd}>
                          <Plus data-icon="inline-start" />
                          新建
                        </Button>
                      </div>
                    ) : (
                      visibleTargets.map((target) => {
                        const active =
                          (target.id === 0 && selectedTargetId === "new") ||
                          String(target.id) === selectedTargetId;
                        const invalid = !target.name.trim() || !target.appriseUrl.trim();

                        return (
                          <button
                            key={target.id || "new"}
                            type="button"
                            className={cn(
                              "flex w-full flex-col gap-2 rounded-lg px-3 py-2.5 text-left transition",
                              active ? "bg-accent/75 text-accent-foreground shadow-sm" : "hover:bg-muted/65",
                            )}
                            onClick={() => setSelectedTargetId(target.id === 0 ? "new" : String(target.id))}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate text-sm font-medium">
                                {target.name.trim() || "未命名通道"}
                              </span>
                              <span
                                className={cn(
                                  "size-2 shrink-0 rounded-full",
                                  invalid
                                    ? "bg-destructive"
                                    : target.enabled
                                      ? "bg-success"
                                      : "bg-muted-foreground/35",
                                )}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                              <span>{target.id === 0 ? "草稿" : target.enabled ? "启用" : "停用"}</span>
                              <span>{target.filterIds.length} 规则</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </aside>

              <div className="min-w-0">
                {selectedTarget ? (
                  <TargetEditor
                    key={selectedTarget.id || "new"}
                    target={selectedTarget}
                    allFilters={filters}
                    onDraftChange={setDraftTarget}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                  />
                ) : (
                  <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
                    <CardContent className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                      <Inbox className="size-7 text-muted-foreground/70" />
                      选择或新建一个转发通道
                      <Button type="button" size="sm" onClick={handleAdd}>
                        <Plus data-icon="inline-start" />
                        新建通道
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}

function TargetEditor({
  target,
  allFilters,
  onDraftChange,
  onSaved,
  onDeleted,
}: {
  target: ForwardTarget;
  allFilters: Filter[];
  onDraftChange: (target: ForwardTarget | null) => void;
  onSaved: (target: ForwardTarget) => void;
  onDeleted: (target: ForwardTarget) => void;
}) {
  const isNew = target.id === 0;
  const [name, setName] = useState(target.name);
  const [appriseUrl, setAppriseUrl] = useState(target.appriseUrl);
  const [enabled, setEnabled] = useState(target.enabled);
  const [filterIds, setFilterIds] = useState<number[]>(target.filterIds);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const invalid = !name.trim() || !appriseUrl.trim();

  const syncDraft = (patch: Partial<ForwardTarget>) => {
    if (!isNew) return;
    onDraftChange({
      id: 0,
      name,
      appriseUrl,
      enabled,
      filterIds,
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

  const handleSave = async () => {
    try {
      if (invalid) throw new Error("名称和推送 URL 不能为空");

      setSaving(true);
      setError(null);
      setNotice(null);
      setDeleteConfirming(false);

      const data = { name: name.trim(), appriseUrl: appriseUrl.trim(), enabled, filterIds };
      const saved = isNew
        ? await api.forwardTargets.create(data)
        : await api.forwardTargets.update(target.id, data);
      onSaved(saved as ForwardTarget);
    } catch (err: any) {
      setError(err.message || "保存失败");
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
      await api.forwardTargets.test(appriseUrl.trim());
      setNotice("测试消息已发送");
    } catch (err: any) {
      setError(err.message || "测试发送失败");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) {
      onDraftChange(null);
      onDeleted(target);
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
      await api.forwardTargets.delete(target.id);
      onDeleted(target);
    } catch (err: any) {
      setError(err.message || "删除失败");
      setSaving(false);
    }
  };

  return (
    <Card className={cn("bg-card/80 shadow-sm ring-1 ring-foreground/10", !enabled && "opacity-75")} size="sm">
      <CardHeader className="gap-3 px-4 pt-4 pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">{isNew ? "新建通道" : "编辑通道"}</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {filterIds.length} 个订阅规则
            </div>
          </div>
          <Badge variant={invalid ? "destructive" : enabled ? "secondary" : "outline"} className="h-7 rounded-lg px-2.5">
            {invalid ? "待完善" : enabled ? "已启用" : "已停用"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-4 pb-4">
        {(error || notice) && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1",
              error
                ? "bg-destructive/10 text-destructive ring-destructive/20"
                : "bg-primary/10 text-primary ring-primary/20",
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
              className="h-10 bg-background/70"
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2.5 text-left ring-1 ring-foreground/10 transition hover:bg-background lg:self-end"
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
            className="h-10 bg-background/70"
          />
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

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
        </div>
      </CardContent>
    </Card>
  );
}
