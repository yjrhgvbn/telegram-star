import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Image,
  KeyRound,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  type LucideIcon,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useClientDevices } from "../hooks/useClientDevices";
import { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";

export const SETTINGS_FORM_ID = "settings-form";

type SettingsFormState = ReturnType<typeof useSettingsForm>;
type SettingsSectionId = "connection" | "telegram" | "clients" | "media";
type SettingsTone = "neutral" | "good" | "warning" | "danger";

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "connection",
  "telegram",
  "clients",
  "media",
];

const qualityPresentation = {
  0: {
    code: "low",
    summary: "弱网或蜂窝网络优先",
    speed: "最快",
    clarity: "较低",
    traffic: "最少",
  },
  1: {
    code: "medium",
    summary: "日常浏览的推荐档位",
    speed: "平衡",
    clarity: "适中",
    traffic: "适中",
  },
  2: {
    code: "high",
    summary: "细节查看与大屏优先",
    speed: "较慢",
    clarity: "最高",
    traffic: "较多",
  },
} as const;

function getQualityPresentation(index: number) {
  return (
    qualityPresentation[index as keyof typeof qualityPresentation] ??
    qualityPresentation[1]
  );
}

interface SettingsNavItem {
  id: SettingsSectionId;
  title: string;
  description: string;
  searchTerms: string;
  icon: LucideIcon;
  badge: string;
  tone: SettingsTone;
}

function getToneBadgeVariant(
  tone: SettingsTone,
): "secondary" | "destructive" | "outline" {
  if (tone === "good") return "secondary";
  if (tone === "danger") return "destructive";
  return "outline";
}

function getToneDotClass(tone: SettingsTone): string {
  if (tone === "good") return "bg-success";
  if (tone === "warning") return "bg-warning";
  if (tone === "danger") return "bg-destructive";
  return "bg-muted-foreground/45";
}

function SectionStatus({
  label,
  tone,
}: {
  label: string;
  tone: SettingsTone;
}) {
  return (
    <Badge
      variant={getToneBadgeVariant(tone)}
      className="h-7 gap-1.5 px-2.5"
    >
      <span className={cn("size-1.5 rounded-full", getToneDotClass(tone))} />
      {label}
    </Badge>
  );
}

export function SettingsForm({
  settings,
}: {
  settings: SettingsFormState;
}) {
  const { sectionId: routeSectionId } = useParams<{ sectionId?: string }>();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const activeSection = SETTINGS_SECTION_IDS.includes(routeSectionId as SettingsSectionId)
    ? (routeSectionId as SettingsSectionId)
    : "connection";
  const isSectionSelected = routeSectionId !== undefined;
  const serverConnection = useServerConnectionSettings();
  const devicesState = useClientDevices();
  const telegramIssues = settings.invalidItems.filter((item) =>
    item.kind.startsWith("telegram"),
  );
  const mediaIssues = settings.invalidItems.filter((item) => item.kind === "media");
  const telegramConfigured = settings.status?.telegramConfigured ?? false;
  const telegramTone: SettingsTone = settings.telegramDirty
    ? "warning"
    : settings.loading
      ? "neutral"
      : telegramIssues.some((item) => item.tone === "danger")
        ? "danger"
        : telegramIssues.length > 0
          ? "warning"
          : "good";
  const mediaTone: SettingsTone = settings.mediaDirty
    ? "warning"
    : settings.loading
      ? "neutral"
      : mediaIssues.length > 0
        ? "warning"
        : "good";
  const connectionTone: SettingsTone = serverConnection.dirty
    ? "warning"
    : serverConnection.summary.tone === "connected"
      ? "good"
      : serverConnection.summary.tone === "failed"
        ? "danger"
        : "neutral";

  const navItems = useMemo<SettingsNavItem[]>(
    () => [
      {
        id: "connection",
        title: "连接",
        description: "后端地址与可达性",
        searchTerms: "连接 后端 地址 server api endpoint",
        icon: Server,
        badge: serverConnection.dirty ? "待保存" : serverConnection.summary.title,
        tone: connectionTone,
      },
      {
        id: "telegram",
        title: "Telegram",
        description: "API 凭据与授权",
        searchTerms: "telegram api id hash 授权 登录",
        icon: KeyRound,
        badge: settings.telegramDirty
          ? "待保存"
          : telegramConfigured
            ? "已配置"
            : "缺失",
        tone: telegramTone,
      },
      {
        id: "clients",
        title: "客户端",
        description: "设备与壳能力",
        searchTerms: "客户端 设备 web pwa tauri mobile",
        icon: MonitorSmartphone,
        badge: devicesState.loading ? "读取中" : `${devicesState.devices.length} 台`,
        tone: devicesState.error
          ? "danger"
          : devicesState.loading
            ? "neutral"
            : "good",
      },
      {
        id: "media",
        title: "媒体",
        description: "缩略图加载策略",
        searchTerms: "媒体 图片 缩略图 清晰度 流量",
        icon: Image,
        badge: settings.mediaDirty
          ? "待保存"
          : (settings.mediaStatus?.thumbQuality ?? "medium"),
        tone: mediaTone,
      },
    ],
    [
      connectionTone,
      devicesState.devices.length,
      devicesState.error,
      devicesState.loading,
      mediaTone,
      serverConnection.dirty,
      serverConnection.summary.title,
      settings.mediaDirty,
      settings.mediaStatus?.thumbQuality,
      settings.telegramDirty,
      telegramConfigured,
      telegramTone,
    ],
  );

  const activeNavItem =
    navItems.find((item) => item.id === activeSection) ?? navItems[0];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredNavItems = useMemo(() => {
    if (!normalizedSearch) return navItems;

    return navItems.filter((item) =>
      `${item.title} ${item.description} ${item.searchTerms}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [navItems, normalizedSearch]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (searchInputRef.current?.offsetParent === null) return;

      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const handleSectionChange = (section: SettingsSectionId) => {
    // flushSync keeps the selected row visually in lockstep with the pointer action.
    navigate(`/settings/${section}`, { flushSync: true });
  };

  const handleDiscard = () => {
    if (activeSection === "connection") {
      serverConnection.resetConnectionDraft();
      return;
    }

    settings.resetDraft();
  };

  const activeDirty =
    activeSection === "connection"
      ? serverConnection.dirty
      : activeSection === "telegram"
        ? settings.telegramDirty
        : activeSection === "media"
          ? settings.mediaDirty
          : false;

  const actionStatus = (() => {
    if (settings.error) return { title: settings.error, tone: "danger" as const };
    if (serverConnection.connectionError && activeSection === "connection") {
      return { title: serverConnection.connectionError, tone: "danger" as const };
    }
    if (activeDirty) return { title: "有未保存的更改", tone: "warning" as const };
    if (settings.notice) return { title: settings.notice, tone: "good" as const };
    if (serverConnection.notice && activeSection === "connection") {
      return { title: serverConnection.notice, tone: "good" as const };
    }
    if (activeSection === "clients") {
      return {
        title: settings.dirty || serverConnection.dirty
          ? "其他分区有未保存更改"
          : "设备操作即时生效",
        tone: settings.dirty || serverConnection.dirty ? "warning" as const : "neutral" as const,
      };
    }
    return { title: "所有更改已保存", tone: "good" as const };
  })();

  const actionMeta =
    activeSection === "connection"
      ? `后端地址：${serverConnection.currentLabel}`
      : activeSection === "telegram"
        ? telegramConfigured
          ? "数据库配置 · 凭据已就绪"
          : "需要补齐 Telegram API 凭据"
        : activeSection === "clients"
          ? `${devicesState.devices.length} 台已注册设备`
          : `当前策略：${settings.mediaStatus?.thumbQuality ?? "medium"}`;

  return (
    <form
      id={SETTINGS_FORM_ID}
      onSubmit={settings.handleSave}
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)_64px] bg-background lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-x-3 lg:p-3",
        !isSectionSelected && "p-3",
      )}
    >
      <aside
        className={cn(
          "row-span-2 min-h-0 min-w-0 flex-col gap-3 lg:col-start-1 lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-[var(--workspace-panel-shadow)]",
          isSectionSelected ? "hidden" : "flex",
          "lg:flex",
        )}
      >
        <label className="relative block shrink-0 lg:m-3">
          <span className="sr-only">搜索设置</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索设置"
            aria-label="搜索设置"
            className="h-10 w-full rounded-lg border border-input bg-card pr-10 pl-9 text-base shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm lg:shadow-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 flex size-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted font-mono text-[11px] text-muted-foreground">
            /
          </kbd>
        </label>

        <div className="shrink-0 px-1 text-[11px] font-semibold tracking-[0.11em] text-muted-foreground uppercase lg:px-4 lg:pb-1">
          系统设置
        </div>

        <nav
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-1 lg:gap-1 lg:px-2 lg:pb-3"
          aria-label="设置分类"
        >
          {filteredNavItems.length > 0 ? (
            filteredNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleSectionChange(item.id)}
                  className={cn(
                    "group grid min-h-16 w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-left shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:shadow-none",
                    active
                      ? "text-foreground lg:border-primary/12 lg:bg-accent"
                      : "text-muted-foreground hover:bg-muted/72 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md bg-muted text-primary transition-colors",
                      active && "bg-secondary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold leading-5 text-foreground">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs leading-4">
                      {item.description}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        getToneDotClass(item.tone),
                      )}
                    />
                    <span className="max-w-20 truncate">{item.badge}</span>
                    <ChevronRight className="size-4 text-muted-foreground/60 lg:hidden" />
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-foreground">没有匹配的设置</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                尝试搜索“连接”或“媒体”。
              </p>
            </div>
          )}
        </nav>

        <div className="shrink-0 lg:border-t lg:border-border lg:p-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full lg:h-9"
            onClick={settings.loadStatus}
            disabled={settings.loading || settings.dirty}
          >
            <RefreshCw className={cn(settings.loading && "animate-spin")} data-icon="inline-start" />
            刷新设置状态
          </Button>
        </div>
      </aside>

      <main
        className={cn(
          "col-start-1 row-start-1 min-h-0 min-w-0 overflow-y-auto bg-card/55 lg:col-start-2 lg:rounded-t-xl lg:border lg:border-b-0 lg:bg-card lg:block",
          isSectionSelected ? "block" : "hidden",
        )}
      >
        <div className="sticky top-0 flex min-h-13 items-center gap-2 border-b border-border bg-card/94 px-3 backdrop-blur-md lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => navigate("/settings", { flushSync: true })}
            aria-label="返回设置分类"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {activeNavItem.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {activeNavItem.description}
            </p>
          </div>
        </div>

        <div className="mx-auto min-h-full w-full max-w-[1060px] px-4 py-5 sm:px-6 sm:py-6 lg:px-9 lg:py-7 xl:px-10">
          {activeSection === "connection" ? (
            <SettingsSection
              title="后端连接"
              description="选择 Telegram Star 请求 API 的目标服务器，并在保存前验证可达性。"
              meta={
                <SectionStatus
                  label={serverConnection.dirty ? "待保存" : serverConnection.summary.title}
                  tone={connectionTone}
                />
              }
            >
              <ServerConnectionSettings settings={serverConnection} />
            </SettingsSection>
          ) : null}

          {activeSection === "telegram" ? (
            <SettingsSection
              title="Telegram API"
              description="更新应用凭据并确认当前授权状态。API Hash 留空时保持已保存值。"
              meta={
                <SectionStatus
                  label={
                    settings.telegramDirty
                      ? "待保存"
                      : telegramIssues.length > 0
                        ? `${telegramIssues.length} 项需处理`
                        : "已配置"
                  }
                  tone={telegramTone}
                />
              }
            >
              <SettingsItem
                title="API ID"
                description="来自 my.telegram.org 的应用标识。"
              >
                <div className="min-w-0">
                  <label htmlFor="telegram-api-id" className="sr-only">
                    API ID
                  </label>
                  <Input
                    id="telegram-api-id"
                    inputMode="numeric"
                    value={settings.apiId}
                    onChange={(event) => settings.setApiId(event.target.value)}
                    placeholder="123456"
                    aria-invalid={telegramIssues.some(
                      (item) => item.kind === "telegram-api",
                    )}
                    className="h-10 bg-card font-mono"
                  />
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    当前数据库配置：
                    <span className="font-mono">
                      {settings.status?.apiId ?? "未设置"}
                    </span>
                  </p>
                </div>
              </SettingsItem>

              <SettingsItem
                title="API Hash"
                description="敏感凭据不会在界面中回显。"
              >
                <div className="min-w-0">
                  <label htmlFor="telegram-api-hash" className="sr-only">
                    API Hash
                  </label>
                  <Input
                    id="telegram-api-hash"
                    type="password"
                    value={settings.apiHash}
                    onChange={(event) => settings.setApiHash(event.target.value)}
                    placeholder={settings.status?.apiHashMasked || "请输入 API Hash"}
                    aria-invalid={telegramIssues.some(
                      (item) => item.kind === "telegram-api",
                    )}
                    className="h-10 bg-card font-mono"
                  />
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {settings.status?.databaseConfigured
                      ? "Hash 已保存；留空表示保持不变。"
                      : "首次保存配置时必须填写 Hash。"}
                  </p>
                </div>
              </SettingsItem>

              <SettingsItem
                title="配置与授权"
                description="状态来自服务器数据库和当前 Telegram 会话。"
              >
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="h-7 px-2.5">
                    {settings.status?.telegramConfigSource === "database"
                      ? "数据库配置"
                      : settings.status?.telegramConfigSource === "env"
                        ? "环境变量"
                        : "尚未配置"}
                  </Badge>
                  <Badge
                    variant={settings.status?.databaseConfigured ? "secondary" : "outline"}
                    className="h-7 px-2.5"
                  >
                    {settings.status?.databaseConfigured ? "Hash 已保存" : "Hash 未保存"}
                  </Badge>
                  <Badge
                    variant={settings.telegramAuthorized ? "secondary" : "outline"}
                    className="h-7 px-2.5"
                  >
                    {settings.telegramAuthorized ? "已授权" : "未授权"}
                  </Badge>
                </div>
              </SettingsItem>

              {telegramIssues.length > 0 ? (
                <SettingsItem title="待处理项" description="完成下列操作后配置才能正常工作。">
                  <div className="flex flex-col gap-2">
                    {telegramIssues.map((item) => (
                      <div
                        key={item.kind}
                        className={cn(
                          "flex items-start gap-2 border px-3 py-2.5 text-sm",
                          item.tone === "danger"
                            ? "border-destructive/20 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/40 text-foreground",
                        )}
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-medium">{item.title}</span>
                          <span className="mt-0.5 block text-xs opacity-75">
                            {item.detail}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </SettingsItem>
              ) : null}
            </SettingsSection>
          ) : null}

          {activeSection === "clients" ? (
            <SettingsSection
              title="客户端设备"
              description="搜索并筛选已注册设备。当前设备保持在线，其他记录可逐行删除。"
              meta={
                <SectionStatus
                  label={
                    devicesState.loading
                      ? "读取中"
                      : `${devicesState.devices.length} 台设备`
                  }
                  tone={devicesState.error ? "danger" : "good"}
                />
              }
            >
              <ClientDevicesSettings state={devicesState} />
              <ClientRuntimeSettings />
            </SettingsSection>
          ) : null}

          {activeSection === "media" ? (
            <SettingsSection
              title="媒体缩略图"
              description={`为消息列表选择预览档位。当前策略为 ${settings.mediaStatus?.thumbQuality ?? "medium"}。`}
              meta={
                <SectionStatus
                  label={
                    settings.mediaDirty
                      ? "待保存"
                      : `${settings.mediaStatus?.thumbQuality ?? "medium"} · ${
                          thumbQualityOptions[settings.thumbIndex]?.title ?? "均衡"
                        }`
                  }
                  tone={mediaTone}
                />
              }
            >
              <SettingsItem
                title="缩略图质量"
                description="同时影响加载速度、图片清晰度与网络流量。"
              >
                <div
                  className="border-y border-border"
                  role="radiogroup"
                  aria-label="媒体缩略图质量"
                >
                  {thumbQualityOptions.map((option) => {
                    const selected = settings.thumbIndex === option.value;
                    const presentation = getQualityPresentation(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-label={`${option.title}，${presentation.summary}`}
                        aria-checked={selected}
                        aria-pressed={selected}
                        onClick={() => settings.setThumbIndex(option.value)}
                        className={cn(
                          "grid min-h-17 w-full grid-cols-[20px_72px_minmax(0,1fr)] items-center gap-2 border-b border-border px-2 py-2.5 text-left transition-colors last:border-b-0 sm:grid-cols-[20px_88px_minmax(0,1fr)] sm:gap-3 xl:grid-cols-[20px_88px_minmax(150px,1fr)_70px_70px_70px]",
                          selected
                            ? "bg-secondary"
                            : "hover:bg-muted/55",
                        )}
                      >
                        <span
                          className={cn(
                            "size-4 rounded-full border border-muted-foreground/55 bg-card",
                            selected && "border-[5px] border-primary",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {option.title}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {presentation.code}
                          </span>
                        </span>
                        <span className="min-w-0 text-xs leading-5 text-muted-foreground">
                          {presentation.summary}
                        </span>
                        <span className="hidden text-right text-xs text-muted-foreground xl:block">
                          <strong className="block font-medium text-foreground">速度</strong>
                          {presentation.speed}
                        </span>
                        <span className="hidden text-right text-xs text-muted-foreground xl:block">
                          <strong className="block font-medium text-foreground">清晰度</strong>
                          {presentation.clarity}
                        </span>
                        <span className="hidden text-right text-xs text-muted-foreground xl:block">
                          <strong className="block font-medium text-foreground">流量</strong>
                          {presentation.traffic}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </SettingsItem>

              <SettingsItem
                title="当前生效"
                description="新策略在保存后用于后续加载的消息缩略图。"
              >
                <dl className="border-y border-border text-sm">
                  <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2">
                    <dt className="text-muted-foreground">已保存策略</dt>
                    <dd className="font-mono font-medium text-foreground">
                      {settings.mediaStatus?.thumbQuality ?? "medium"}
                    </dd>
                  </div>
                  <div className="flex min-h-11 items-center justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">待保存策略</dt>
                    <dd className="font-mono font-medium text-foreground">
                      {getQualityPresentation(settings.thumbIndex).code}
                    </dd>
                  </div>
                </dl>
              </SettingsItem>

              {mediaIssues.length > 0 ? (
                <SettingsItem title="待处理项">
                  <div className="flex flex-col gap-2">
                    {mediaIssues.map((item) => (
                      <div
                        key={item.kind}
                        className="flex items-start gap-2 border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground"
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          <span className="block font-medium">{item.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {item.detail}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </SettingsItem>
              ) : null}
            </SettingsSection>
          ) : null}
        </div>
      </main>

      <footer
        className={cn(
          "col-start-1 row-start-2 min-w-0 items-center justify-between gap-3 border-t border-border bg-card px-3 py-2 shadow-[0_-6px_18px_color-mix(in_oklab,var(--foreground)_4%,transparent)] sm:px-4 lg:col-start-2 lg:rounded-b-xl lg:border lg:border-t lg:flex lg:shadow-[var(--workspace-panel-shadow)]",
          isSectionSelected ? "flex" : "hidden",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              getToneDotClass(actionStatus.tone),
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {actionStatus.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">{actionMeta}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {activeSection !== "clients" ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={!activeDirty}
              onClick={handleDiscard}
              className="hidden sm:inline-flex"
            >
              <RotateCcw data-icon="inline-start" />
              放弃更改
            </Button>
          ) : null}

          {activeSection === "connection" ? (
            <Button
              type="button"
              size="lg"
              disabled={!serverConnection.dirty}
              onClick={serverConnection.saveConnection}
            >
              <Save data-icon="inline-start" />
              保存地址
            </Button>
          ) : activeSection === "clients" ? (
            <Button
              type="button"
              size="lg"
              disabled={devicesState.refreshing}
              onClick={devicesState.refresh}
            >
              {devicesState.refreshing ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              刷新设备
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={!activeDirty || settings.saving || settings.loading}
            >
              {settings.saving ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : settings.notice ? (
                <CheckCircle2 data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {settings.saving
                ? "保存中"
                : activeSection === "media"
                  ? "保存媒体设置"
                  : "保存更改"}
            </Button>
          )}
        </div>
      </footer>
    </form>
  );
}
