import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Save, Trash2, Plus, Send } from "lucide-react";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";

interface ForwardTarget {
  id: number;
  name: string;
  appriseUrl: string;
  enabled: boolean;
  filterIds: number[];
}

export function NotificationsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters } = useFilters();

  const [targets, setTargets] = useState<ForwardTarget[]>([]);
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

  const handleAdd = () => {
    setTargets((prev) => [
      { id: 0, name: "", appriseUrl: "", enabled: true, filterIds: [] },
      ...prev,
    ]);
  };

  return (
    <AppShell
      activeTab="notifications"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="mt-0 flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BellRing className="size-5" />
                <h2 className="text-lg font-semibold">转发通道设置 (Apprise)</h2>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={loadTargets} disabled={loading}>
                  <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
                  刷新
                </Button>
                <Button onClick={handleAdd}>
                  <Plus data-icon="inline-start" />
                  新建通道
                </Button>
              </div>
            </div>

            {error && (
              <Card className="border border-destructive/30 bg-destructive/5">
                <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {targets.map((target, idx) => (
                <TargetEditor
                  key={target.id || `new-${idx}`}
                  target={target}
                  allFilters={filters}
                  onSaved={loadTargets}
                  onDeleted={loadTargets}
                />
              ))}
              {targets.length === 0 && !loading && (
                <div className="col-span-full py-12 text-center text-sm text-muted-foreground border rounded-lg border-dashed">
                  当前还没有任何转发通道。点击“新建通道”创建一个吧！
                </div>
              )}
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
  onSaved,
  onDeleted,
}: {
  target: ForwardTarget;
  allFilters: any[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isNew = target.id === 0;
  const [name, setName] = useState(target.name);
  const [appriseUrl, setAppriseUrl] = useState(target.appriseUrl);
  const [enabled, setEnabled] = useState(target.enabled);
  const [filterIds, setFilterIds] = useState<number[]>(target.filterIds);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleFilter = (filterId: number) => {
    setFilterIds((prev) =>
      prev.includes(filterId) ? prev.filter((id) => id !== filterId) : [...prev, filterId],
    );
  };

  const handleSave = async () => {
    try {
      if (!name.trim() || !appriseUrl.trim()) {
        throw new Error("名称和推送 URL 不能为空");
      }
      setSaving(true);
      setError(null);
      const data = { name, appriseUrl, enabled, filterIds };
      if (isNew) {
        await api.forwardTargets.create(data);
      } else {
        await api.forwardTargets.update(target.id, data);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      if (!appriseUrl.trim()) {
        throw new Error("推送 URL 不能为空");
      }
      setTesting(true);
      setError(null);
      await api.forwardTargets.test(appriseUrl);
      window.alert("测试消息发送成功，请检查目标平台。");
    } catch (err: any) {
      setError(err.message || "测试发送失败");
    } finally {
      setTesting(false);
    }
  };


  const handleDelete = async () => {
    if (isNew) {
      onDeleted(); // just remove from UI array by triggering reload, wait, that won't remove local unsaved ones easily. We'll rely on loadTargets wiping it out.
      return;
    }
    if (!window.confirm("确定删除该转发通道吗？")) return;
    try {
      setSaving(true);
      await api.forwardTargets.delete(target.id);
      onDeleted();
    } catch (err: any) {
      setError(err.message || "删除失败");
      setSaving(false);
    }
  };

  return (
    <Card className={cn("border bg-card/70 flex flex-col", !enabled && "opacity-70")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="通道名称 (如: 钉钉开发群)"
            className="font-medium text-base bg-transparent border-none px-0 h-auto focus-visible:ring-0 w-2/3"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-3.5"
            />
            {enabled ? "已启用" : "已停用"}
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        {error && <div className="text-xs text-destructive">{error}</div>}
        
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground/80">Apprise URL</p>
          <Input
            value={appriseUrl}
            onChange={(e) => setAppriseUrl(e.target.value)}
            placeholder="dingtalk://Token  /  discord://ID/Token"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            支持 90+ 平台，具体写法参考 <a href="https://github.com/caronc/apprise/wiki" target="_blank" rel="noreferrer" className="underline">Apprise 官方文档</a>。
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/80">订阅规则 (命中时推送)</p>
          <div className="flex flex-wrap gap-2">
            {allFilters.map((f) => {
              const checked = filterIds.includes(f.id);
              return (
                <Badge
                  key={f.id}
                  variant={checked ? "default" : "outline"}
                  className={cn("cursor-pointer select-none", !checked && "text-muted-foreground")}
                  onClick={() => handleToggleFilter(f.id)}
                >
                  {f.name}
                </Badge>
              );
            })}
            {allFilters.length === 0 && (
              <span className="text-xs text-muted-foreground">暂无可用过滤器</span>
            )}
          </div>
        </div>
      </CardContent>
      
      <div className="p-4 pt-0 mt-auto flex items-center justify-between border-t border-border/30 bg-muted/20">
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saving || testing} className="text-destructive hover:bg-destructive/10 hover:text-destructive px-2">
          <Trash2 className="size-4" />
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleTest} disabled={saving || testing}>
            <Send className="size-4 mr-1.5" />
            测试发送
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || testing}>
            <Save className="size-4 mr-1.5" />
            保存
          </Button>
        </div>
      </div>
    </Card>
  );
}
