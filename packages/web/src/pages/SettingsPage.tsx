import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Image,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { api, type MediaConfigStatus } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { cn } from "@/lib/utils";
import type { AuthStatus } from "@/types";

type TelegramConfigStatus = Pick<
  AuthStatus,
  "telegramConfigured" | "databaseConfigured" | "apiId" | "apiHashMasked"
>;

const thumbQualityOptions: Array<{
  value: number;
  title: string;
  description: string;
}> = [
  { value: 0, title: "省流", description: "更快" },
  { value: 1, title: "均衡", description: "推荐" },
  { value: 2, title: "清晰", description: "更细节" },
];

function SettingRow({
  icon: Icon,
  title,
  meta,
  children,
}: {
  icon: typeof AlertCircle;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-lg bg-background/65 p-3 ring-1 ring-foreground/10 lg:grid-cols-[210px_minmax(0,760px)]">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-6 text-foreground">{title}</h2>
            {meta}
          </div>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const [status, setStatus] = useState<TelegramConfigStatus | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaConfigStatus | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [thumbIndex, setThumbIndex] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const invalidItems = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      icon: typeof AlertCircle;
      tone: "danger" | "warning";
    }> = [];

    if (status && !status.telegramConfigured) {
      items.push({
        title: "Telegram API 缺失",
        detail: "补齐 API ID 和 API Hash",
        icon: KeyRound,
        tone: "danger",
      });
    }

    if (status?.telegramConfigured && !authStatus.authorized) {
      items.push({
        title: "Telegram 未授权",
        detail: "完成登录后才能同步消息",
        icon: ShieldAlert,
        tone: "warning",
      });
    }

    if (!loading && !mediaStatus) {
      items.push({
        title: "媒体配置未加载",
        detail: "刷新后重试",
        icon: Image,
        tone: "warning",
      });
    }

    return items;
  }, [authStatus.authorized, loading, mediaStatus, status]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!apiId.trim()) {
      setError("Telegram API ID 不能为空");
      return;
    }

    if (!apiHash.trim() && !status?.databaseConfigured) {
      setError("保存新配置时需要填写 Telegram API Hash");
      return;
    }

    try {
      setSaving(true);
      const nextConfig = await api.config.update({
        telegram: {
          apiId: apiId.trim(),
          apiHash: apiHash.trim(),
        },
        media: {
          thumbIndex,
        },
      });
      setStatus(nextConfig.telegram);
      setMediaStatus(nextConfig.media);
      setApiId(nextConfig.telegram.apiId ? String(nextConfig.telegram.apiId) : apiId.trim());
      setApiHash("");
      setThumbIndex(nextConfig.media.thumbIndex);
      setMessage("设置已保存");
    } catch (err: any) {
      setError(err.message || "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const statusContent = (() => {
    if (loading && !status) {
      return {
        icon: <LoaderCircle className="size-4 animate-spin" />,
        title: "正在读取配置",
        tone: "loading" as const,
      };
    }

    if (invalidItems.length === 0) {
      return {
        icon: <CheckCircle2 className="size-4" />,
        title: "当前没有失效项",
        tone: "valid" as const,
      };
    }

    return {
      icon: <AlertCircle className="size-4" />,
      title: `${invalidItems.length} 项需处理`,
      tone: "invalid" as const,
    };
  })();

  return (
    <AppShell
      activeTab="settings"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto px-3 py-3 sm:px-4 lg:px-5">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
            <header className="rounded-lg bg-card/80 p-4 shadow-sm ring-1 ring-foreground/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Settings className="size-4" />
                    系统设置
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                    当前配置
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={loadStatus} disabled={loading}>
                    <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
                    刷新
                  </Button>
                  <Button type="submit" form="settings-form" disabled={saving || loading}>
                    {saving ? (
                      <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Save data-icon="inline-start" />
                    )}
                    {saving ? "保存中" : "保存设置"}
                  </Button>
                </div>
              </div>
            </header>

            {(error || message) && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1",
                  error
                    ? "bg-destructive/10 text-destructive ring-destructive/20"
                    : "bg-primary/10 text-primary ring-primary/20",
                )}
              >
                {error ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
                <span>{error || message}</span>
              </div>
            )}

            <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
              <CardContent className="px-4 py-4">
                <form id="settings-form" onSubmit={handleSave} className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                  <aside
                    className={cn(
                      "flex flex-col gap-3 rounded-lg p-4 ring-1 xl:self-start",
                      statusContent.tone === "invalid"
                        ? "bg-destructive/5 ring-destructive/15"
                        : statusContent.tone === "valid"
                          ? "bg-primary/5 ring-primary/15"
                          : "bg-muted/55 ring-foreground/10",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          statusContent.tone === "invalid"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {statusContent.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">当前状态</div>
                        <div className="mt-0.5 text-sm font-semibold text-foreground">{statusContent.title}</div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-background/75 px-3 py-2 text-sm ring-1 ring-foreground/10">
                        <span className="text-muted-foreground">API ID</span>
                        <span className="font-medium">{(status?.apiId ?? apiId) || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-background/75 px-3 py-2 text-sm ring-1 ring-foreground/10">
                        <span className="text-muted-foreground">缩略图</span>
                        <Badge variant="outline" className="h-6 rounded-md px-2">
                          thumb {mediaStatus?.thumbIndex ?? thumbIndex}
                        </Badge>
                      </div>
                    </div>

                    {invalidItems.length > 0 && (
                      <div className="grid gap-2">
                        {invalidItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.title}
                              className={cn(
                                "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm ring-1",
                                item.tone === "danger"
                                  ? "bg-destructive/10 text-destructive ring-destructive/20"
                                  : "bg-background/75 text-foreground ring-foreground/10",
                              )}
                            >
                              <Icon className="mt-0.5 size-4 shrink-0" />
                              <span className="min-w-0">
                                <span className="block font-medium leading-5">{item.title}</span>
                                <span className="mt-0.5 block text-xs opacity-75">{item.detail}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </aside>

                  <div className="flex min-w-0 flex-col gap-3">
                    <SettingRow
                      icon={KeyRound}
                      title="Telegram API"
                      meta={
                        <Badge variant={status?.telegramConfigured ? "secondary" : "destructive"} className="h-6 rounded-lg px-2">
                          {status?.telegramConfigured ? "有效" : "缺失"}
                        </Badge>
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <div className="flex flex-col gap-2">
                          <label htmlFor="telegram-api-id" className="text-sm font-medium">
                            API ID
                          </label>
                          <Input
                            id="telegram-api-id"
                            inputMode="numeric"
                            value={apiId}
                            onChange={(event) => setApiId(event.target.value)}
                            placeholder="123456"
                            className="h-10 bg-background/80"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label htmlFor="telegram-api-hash" className="text-sm font-medium">
                            API Hash
                          </label>
                          <Input
                            id="telegram-api-hash"
                            type="password"
                            value={apiHash}
                            onChange={(event) => setApiHash(event.target.value)}
                            placeholder={status?.apiHashMasked || "请输入 API Hash"}
                            className="h-10 bg-background/80"
                          />
                        </div>
                      </div>
                    </SettingRow>

                    <SettingRow
                      icon={Image}
                      title="媒体缩略图"
                      meta={
                        <Badge variant="secondary" className="h-6 rounded-lg px-2">
                          {mediaStatus?.thumbQuality ?? "medium"}
                        </Badge>
                      }
                    >
                      <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted/65 p-1">
                        {thumbQualityOptions.map((option) => {
                          const selected = thumbIndex === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setThumbIndex(option.value)}
                              aria-pressed={selected}
                              className={cn(
                                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2 text-center transition",
                                selected
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                              )}
                            >
                              <span className="text-sm font-medium leading-5">{option.title}</span>
                              <span className="text-xs leading-4">{option.description}</span>
                            </button>
                          );
                        })}
                      </div>
                    </SettingRow>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
