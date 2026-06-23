import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save, Settings } from "lucide-react";
import { api, type MediaConfigStatus } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { cn } from "@/lib/utils";
import type { AuthStatus } from "@/types";

type TelegramConfigStatus = Pick<
  AuthStatus,
  "telegramConfigured" | "telegramConfigSource" | "databaseConfigured" | "apiId" | "apiHashMasked"
>;

function sourceLabel(source: TelegramConfigStatus["telegramConfigSource"]): string {
  if (source === "env") return ".env";
  if (source === "database") return "数据库";
  return "未配置";
}

const thumbQualityOptions: Array<{
  value: number;
  title: string;
  description: string;
}> = [
  { value: 0, title: "低质量", description: "更快加载" },
  { value: 1, title: "中等", description: "推荐平衡" },
  { value: 2, title: "高质量", description: "更清晰" },
];

export function SettingsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const [status, setStatus] = useState<TelegramConfigStatus | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaConfigStatus | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [thumbIndex, setThumbIndex] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextConfig = await api.config.get();
      setStatus(nextConfig.telegram);
      setMediaStatus(nextConfig.media);
      setApiId(nextConfig.telegram.apiId ? String(nextConfig.telegram.apiId) : "");
      setApiHash("");
      setThumbIndex(nextConfig.media.thumbIndex);
    } catch (err: any) {
      setError(err.message || "加载配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!apiId.trim()) {
      setError("Telegram API ID 不能为空");
      return;
    }

    if (!apiHash.trim() && !status?.databaseConfigured) {
      setError("首次保存数据库配置时需要填写 Telegram API Hash");
      return;
    }

    try {
      setSaving(true);
      const nextConfig = await api.config.update({
        telegram: {
          apiId: apiId.trim(),
          apiHash: apiHash.trim(),
        },
      });
      setStatus(nextConfig.telegram);
      setMediaStatus(nextConfig.media);
      setApiId(nextConfig.telegram.apiId ? String(nextConfig.telegram.apiId) : apiId.trim());
      setApiHash("");
      setMessage(
        nextConfig.telegram.telegramConfigSource === "env"
          ? "配置已保存；数据库配置会优先于 .env 生效"
          : "Telegram API 配置已更新",
      );
    } catch (err: any) {
      setError(err.message || "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMedia = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      setSavingMedia(true);
      const nextConfig = await api.config.update({ media: { thumbIndex } });
      setStatus(nextConfig.telegram);
      setMediaStatus(nextConfig.media);
      setThumbIndex(nextConfig.media.thumbIndex);
      setMessage("媒体缩略图质量已更新，缩略图缓存已清空");
    } catch (err: any) {
      setError(err.message || "保存媒体配置失败");
    } finally {
      setSavingMedia(false);
    }
  };

  return (
    <AppShell
      activeTab="settings"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="mt-0 flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Settings className="size-5" />
                <h2 className="text-lg font-semibold">系统设置</h2>
              </div>
              <Button type="button" variant="outline" onClick={loadStatus} disabled={loading}>
                <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
                刷新
              </Button>
            </div>

            {error && (
              <Card className="border border-destructive/30 bg-destructive/5">
                <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
              </Card>
            )}

            {message && (
              <Card className="border border-primary/30 bg-primary/5">
                <CardContent className="pt-4 text-sm text-foreground">{message}</CardContent>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <div className="flex flex-col gap-4">
                <Card className="border bg-card/70">
                  <CardHeader>
                    <CardTitle>Telegram API</CardTitle>
                    <CardDescription>用于连接 Telegram MTProto</CardDescription>
                    <CardAction>
                      <Badge variant={status?.telegramConfigured ? "secondary" : "outline"}>
                        {sourceLabel(status?.telegramConfigSource || "missing")}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <form id="telegram-config-form" onSubmit={handleSave} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground/80">API ID</label>
                        <Input
                          inputMode="numeric"
                          value={apiId}
                          onChange={(event) => setApiId(event.target.value)}
                          placeholder="123456"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground/80">API Hash</label>
                        <Input
                          type="password"
                          value={apiHash}
                          onChange={(event) => setApiHash(event.target.value)}
                          placeholder={status?.apiHashMasked || "请输入 API Hash"}
                        />
                        <p className="text-xs text-muted-foreground">
                          {status?.databaseConfigured ? "留空将保留数据库中已有的 API Hash" : "首次保存需要填写完整 API Hash"}
                        </p>
                      </div>
                    </form>
                  </CardContent>
                  <CardFooter className="justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {status?.telegramConfigSource === "env"
                        ? "当前使用 .env；保存数据库配置后会优先生效"
                        : "保存后新登录流程会使用数据库配置"}
                    </p>
                    <Button type="submit" form="telegram-config-form" disabled={saving || loading}>
                      <Save data-icon="inline-start" />
                      {saving ? "保存中..." : "保存"}
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="border bg-card/70">
                  <CardHeader>
                    <CardTitle>媒体预览</CardTitle>
                    <CardDescription>控制 Telegram 图片、视频和贴纸缩略图下载质量</CardDescription>
                    <CardAction>
                      <Badge variant="secondary">thumb: {mediaStatus?.thumbIndex ?? thumbIndex}</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <form id="media-config-form" onSubmit={handleSaveMedia} className="flex flex-col gap-4">
                      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-1">
                        {thumbQualityOptions.map((option) => {
                          const selected = thumbIndex === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setThumbIndex(option.value)}
                              className={cn(
                                "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 text-center transition-colors",
                                selected
                                  ? "border-border bg-background text-foreground shadow-sm"
                                  : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
                              )}
                            >
                              <span className="text-sm font-medium leading-5">{option.title}</span>
                              <span className="text-xs leading-4">{option.description}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        切换后会清空服务端缩略图缓存；浏览器下次请求会按新质量重新下载。
                      </p>
                    </form>
                  </CardContent>
                  <CardFooter className="justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      当前档位：thumb {mediaStatus?.thumbIndex ?? thumbIndex}
                    </p>
                    <Button type="submit" form="media-config-form" disabled={savingMedia || loading}>
                      <Save data-icon="inline-start" />
                      {savingMedia ? "保存中..." : "保存"}
                    </Button>
                  </CardFooter>
                </Card>
              </div>

              <Card className="border bg-card/70">
                <CardHeader>
                  <CardTitle>当前状态</CardTitle>
                  <CardDescription>生效配置摘要</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">配置来源</span>
                    <Badge variant={status?.telegramConfigured ? "default" : "outline"}>
                      {sourceLabel(status?.telegramConfigSource || "missing")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">API ID</span>
                    <span className="font-mono text-sm">{status?.apiId ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">API Hash</span>
                    <span className="font-mono text-sm">{status?.apiHashMasked ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">数据库配置</span>
                    <Badge variant={status?.databaseConfigured ? "secondary" : "outline"}>
                      {status?.databaseConfigured ? "已保存" : "未保存"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm text-muted-foreground">缩略图质量</span>
                    <Badge variant="secondary">
                      thumb {mediaStatus?.thumbIndex ?? thumbIndex}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
