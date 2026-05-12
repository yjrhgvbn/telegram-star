import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Save } from "lucide-react";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { cn } from "@/lib/utils";
import type { ReadSyncLog } from "@/types";

export function NotificationsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();

  const [enabledFeishu, setEnabledFeishu] = useState(false);
  const [feishuWebhookUrl, setFeishuWebhookUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [readSyncLogs, setReadSyncLogs] = useState<ReadSyncLog[]>([]);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const settings = await api.notifications.getSettings();
      setEnabledFeishu(settings.sources.includes("feishu"));
      setFeishuWebhookUrl(settings.feishuWebhookUrl || "");
    } catch (err: any) {
      setError(err.message || "加载通知配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

      const nextSources = enabledFeishu ? (["feishu"] as const) : [];
      await api.notifications.updateSettings({
        sources: [...nextSources],
        feishuWebhookUrl,
      });

      setSaveSuccess(true);
    } catch (err: any) {
      setError(err.message || "保存通知配置失败");
    } finally {
      setSaving(false);
    }
  }, [enabledFeishu, feishuWebhookUrl]);

  const loadReadSyncLogs = useCallback(async () => {
    try {
      setLogLoading(true);
      setLogError(null);
      const res = await api.messages.readSyncLogs(120);
      setReadSyncLogs(res.data);
    } catch (err: any) {
      setLogError(err.message || "加载已读同步日志失败");
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadReadSyncLogs();
  }, [loadReadSyncLogs]);

  useEffect(() => {
    if (!saveSuccess) {
      return;
    }

    const timer = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  return (
    <AppShell
      activeTab="notifications"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="mt-0 flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BellRing className="size-5" />
                <h2 className="text-lg font-semibold">通知源设置</h2>
              </div>
              <Button type="button" variant="outline" onClick={loadSettings} disabled={loading || saving}>
                <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
                刷新
              </Button>
            </div>

            <Card className="border border-border/70 bg-card/70">
              <CardHeader>
                <CardTitle>飞书转发</CardTitle>
                <CardDescription>将命中过滤器的 Telegram 消息转发到飞书机器人。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={enabledFeishu}
                    onChange={(e) => setEnabledFeishu(e.target.checked)}
                  />
                  启用飞书通知源
                </label>

                <div className="space-y-2">
                  <p className="text-sm font-medium">飞书 Webhook URL</p>
                  <Input
                    type="text"
                    value={feishuWebhookUrl}
                    onChange={(e) => setFeishuWebhookUrl(e.target.value)}
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                  />
                  <p className="text-xs text-muted-foreground">
                    保存后将写入服务器侧配置文件，并覆盖运行时通知设置。
                  </p>
                </div>
              </CardContent>
            </Card>

            {error && (
              <Card className="border border-destructive/30 bg-destructive/5">
                <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
              </Card>
            )}

            <div className="flex items-center gap-3">
              <Button type="button" onClick={saveSettings} disabled={saving || loading}>
                <Save data-icon="inline-start" />
                保存配置
              </Button>

              {saveSuccess && (
                <Badge variant="secondary" className="h-8 rounded-full px-3">
                  <CheckCircle2 className="size-3.5" data-icon="inline-start" />
                  已保存
                </Badge>
              )}
            </div>

            <Card className="border border-border/70 bg-card/70">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>已读同步日志</CardTitle>
                  <CardDescription>仅展示最近 30 天关键日志，自动清理过期记录。</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={loadReadSyncLogs} disabled={logLoading}>
                  <RefreshCw className={cn(logLoading && "animate-spin")} data-icon="inline-start" />
                  刷新日志
                </Button>
              </CardHeader>
              <CardContent>
                {logError && (
                  <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {logError}
                  </div>
                )}

                {logLoading ? (
                  <p className="text-sm text-muted-foreground">加载日志中...</p>
                ) : readSyncLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无日志</p>
                ) : (
                  <div className="max-h-115 space-y-2 overflow-y-auto pr-1">
                    {readSyncLogs.map((log) => (
                      <div key={log.id} className="rounded-lg border border-border/60 bg-background/60 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="h-6 rounded-full px-2 text-[11px]">
                            {log.source}
                          </Badge>
                          <Badge variant="outline" className="h-6 rounded-full px-2 text-[11px]">
                            {log.action}
                          </Badge>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{log.message}</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {log.chatId && <span>chat: {log.chatId}</span>}
                          {typeof log.telegramMessageId === "number" && <span>tgMsg: {log.telegramMessageId}</span>}
                          {typeof log.rowId === "number" && <span>row: {log.rowId}</span>}
                        </div>
                        {log.details && (
                          <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-2 text-[11px] leading-4 text-muted-foreground">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
