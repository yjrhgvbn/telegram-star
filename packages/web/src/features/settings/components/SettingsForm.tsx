import { useMemo } from "react";
import {
  AlertCircle,
  Image,
  KeyRound,
  MonitorSmartphone,
  Server,
  type LucideIcon,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ClientDevicesSettings } from "./ClientDevicesSettings";
import { ClientRuntimeSettings } from "./ClientRuntimeSettings";
import { ServerConnectionSettings } from "./ServerConnectionSettings";
import { SettingsItem, SettingsSection } from "./SettingsSection";
import {
  thumbQualityOptions,
  type useSettingsForm,
} from "../hooks/useSettingsForm";
import { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";

export const SETTINGS_FORM_ID = "settings-form";

type SettingsFormState = ReturnType<typeof useSettingsForm>;
type SettingsSectionId = "connection" | "telegram" | "clients" | "media";
const SETTINGS_SECTION_IDS: SettingsSectionId[] = ["connection", "telegram", "clients", "media"];

interface SettingsNavItem {
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  tone: "neutral" | "good" | "warning" | "danger";
}

function getToneBadgeVariant(
  tone: SettingsNavItem["tone"],
): "default" | "secondary" | "destructive" | "outline" {
  if (tone === "good") return "secondary";
  if (tone === "danger") return "destructive";
  return "outline";
}

export function SettingsForm({
  settings,
}: {
  settings: SettingsFormState;
}) {
  const { sectionId: routeSectionId } = useParams<{ sectionId?: string }>();
  const navigate = useNavigate();
  const activeSection = SETTINGS_SECTION_IDS.includes(routeSectionId as SettingsSectionId)
    ? (routeSectionId as SettingsSectionId)
    : "connection";
  const isSectionSelected = routeSectionId !== undefined;
  const serverConnection = useServerConnectionSettings();
  const telegramIssues = settings.invalidItems.filter((item) => item.kind.startsWith("telegram"));
  const mediaIssues = settings.invalidItems.filter((item) => item.kind === "media");
  const telegramConfigured = settings.status?.telegramConfigured ?? false;
  const telegramTone: SettingsNavItem["tone"] = settings.loading
    ? "neutral"
    : telegramIssues.some((item) => item.tone === "danger")
      ? "danger"
      : telegramIssues.length > 0
        ? "warning"
        : "good";
  const mediaTone: SettingsNavItem["tone"] = settings.loading
    ? "neutral"
    : mediaIssues.length > 0
      ? "warning"
      : "good";
  const connectionTone: SettingsNavItem["tone"] =
    serverConnection.summary.tone === "connected"
      ? "good"
      : serverConnection.summary.tone === "failed"
        ? "danger"
        : "neutral";
  const navItems = useMemo<SettingsNavItem[]>(
    () => [
      {
        id: "connection",
        title: "连接",
        description: "后端地址",
        icon: Server,
        badge: serverConnection.summary.title,
        tone: connectionTone,
      },
      {
        id: "telegram",
        title: "Telegram",
        description: "API 与授权",
        icon: KeyRound,
        badge: telegramConfigured ? "已配置" : "缺失",
        tone: telegramTone,
      },
      {
        id: "clients",
        title: "客户端",
        description: "设备与壳能力",
        icon: MonitorSmartphone,
        badge: "设备",
        tone: "neutral",
      },
      {
        id: "media",
        title: "媒体",
        description: "缩略图策略",
        icon: Image,
        badge: settings.mediaStatus?.thumbQuality ?? "medium",
        tone: mediaTone,
      },
    ],
    [
      connectionTone,
      mediaTone,
      serverConnection.summary.title,
      settings.mediaStatus?.thumbQuality,
      telegramConfigured,
      telegramTone,
    ],
  );
  const activeNavItem = navItems.find((item) => item.id === activeSection) ?? navItems[0];

  return (
    <form
      id={SETTINGS_FORM_ID}
      onSubmit={settings.handleSave}
      className="flex h-full min-h-0 min-w-0"
    >
      <aside
        className={cn(
          "min-h-0 shrink-0 flex-col border-r border-border bg-sidebar/54",
          isSectionSelected ? "hidden lg:flex lg:w-[252px]" : "flex w-full lg:w-[252px]",
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
          <p className="text-sm font-semibold">设置分类</p>
          <Badge variant="outline">{navItems.length}</Badge>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
          aria-label="设置分类"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;

            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(`/settings/${item.id}`)}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-card/72 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-transparent",
                    active && "bg-primary",
                  )}
                />
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-5 text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs leading-4">{item.description}</span>
                </span>
                <Badge
                  variant={getToneBadgeVariant(item.tone)}
                  className="max-w-20 truncate"
                >
                  {item.badge}
                </Badge>
              </button>
            );
          })}
        </nav>
      </aside>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-y-auto p-3",
          isSectionSelected ? "block" : "hidden lg:block",
        )}
      >
        <div className="mx-auto w-full max-w-[980px]">
        {activeSection === "connection" && activeNavItem && (
          <SettingsSection
            icon={activeNavItem.icon}
            title="连接"
            description="后端地址"
            meta={
              <Badge
                variant={getToneBadgeVariant(activeNavItem.tone)}
                className="h-6 px-2"
              >
                {serverConnection.summary.title}
              </Badge>
            }
          >
            <ServerConnectionSettings settings={serverConnection} />
          </SettingsSection>
        )}

        {activeSection === "telegram" && activeNavItem && (
          <SettingsSection
            icon={activeNavItem.icon}
            title="Telegram"
            description="API 与授权"
            meta={
              <Badge
                variant={getToneBadgeVariant(telegramTone)}
                className="h-6 px-2"
              >
                {telegramIssues.length > 0 ? `${telegramIssues.length} 项需处理` : "正常"}
              </Badge>
            }
          >
            <SettingsItem
              title="API 凭据"
              meta={
                <Badge
                  variant={telegramConfigured ? "secondary" : "destructive"}
                  className="h-6 px-2"
                >
                  {telegramConfigured ? "有效" : "缺失"}
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
                    value={settings.apiId}
                    onChange={(event) => settings.setApiId(event.target.value)}
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
                    value={settings.apiHash}
                    onChange={(event) => settings.setApiHash(event.target.value)}
                    placeholder={settings.status?.apiHashMasked || "请输入 API Hash"}
                    className="h-10 bg-background/80"
                  />
                </div>
              </div>
            </SettingsItem>

            <SettingsItem title="当前状态">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="h-6 px-2">
                  {settings.status?.telegramConfigSource === "database" ? "数据库配置" : "环境变量"}
                </Badge>
                <Badge
                  variant={settings.status?.databaseConfigured ? "secondary" : "outline"}
                  className="h-6 px-2"
                >
                  {settings.status?.databaseConfigured ? "Hash 已保存" : "Hash 未保存"}
                </Badge>
                <Badge
                  variant={settings.telegramAuthorized ? "secondary" : "outline"}
                  className="h-6 px-2"
                >
                  {settings.telegramAuthorized ? "已授权" : "未授权"}
                </Badge>
                <Badge variant="outline" className="h-6 px-2">
                  API ID {(settings.status?.apiId ?? settings.apiId) || "-"}
                </Badge>
              </div>
            </SettingsItem>

            {telegramIssues.length > 0 && (
              <SettingsItem title="待处理项">
                <div className="flex flex-col gap-2">
                  {telegramIssues.map((item) => (
                    <div
                      key={item.title}
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_72%,transparent)]",
                        item.tone === "danger"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-background/58 text-foreground",
                      )}
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium leading-5">{item.title}</span>
                        <span className="block text-xs opacity-75">{item.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </SettingsItem>
            )}
          </SettingsSection>
        )}

        {activeSection === "clients" && activeNavItem && (
          <SettingsSection
            icon={activeNavItem.icon}
            title="客户端"
            description="设备与壳能力"
          >
            <ClientDevicesSettings />
            <ClientRuntimeSettings />
          </SettingsSection>
        )}

        {activeSection === "media" && activeNavItem && (
          <SettingsSection
            icon={activeNavItem.icon}
            title="媒体"
            description="缩略图策略"
            meta={
              <Badge variant="secondary" className="h-6 px-2">
                {settings.mediaStatus?.thumbQuality ?? "medium"}
              </Badge>
            }
          >
            <SettingsItem
              title="缩略图质量"
              description="影响消息列表中的图片预览大小和清晰度。"
            >
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-background/60 p-1 shadow-[inset_0_1px_5px_color-mix(in_oklab,var(--foreground)_6%,transparent)]">
                {thumbQualityOptions.map((option) => {
                  const selected = settings.thumbIndex === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => settings.setThumbIndex(option.value)}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-center transition",
                        selected
                          ? "bg-card text-foreground shadow-[0_8px_24px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                          : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                      )}
                    >
                      <span className="text-sm font-medium leading-5">{option.title}</span>
                      <span className="text-xs leading-4">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </SettingsItem>

            {mediaIssues.length > 0 && (
              <SettingsItem title="待处理项">
                <div className="flex flex-col gap-2">
                  {mediaIssues.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-2 rounded-lg bg-background/58 px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_72%,transparent)]"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium leading-5">{item.title}</span>
                        <span className="block text-xs opacity-75">{item.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </SettingsItem>
            )}
          </SettingsSection>
        )}
        </div>
      </div>
    </form>
  );
}
