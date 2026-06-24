import type { ReactNode } from "react";
import { BellRing, ListFilter, MessageSquareText, Settings, Sparkles } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TelegramLogin } from "@/components/TelegramLogin";
import { cn } from "@/lib/utils";
import type { AuthStatus } from "@/types";

type AppTab = "messages" | "filters" | "notifications" | "settings";

interface AppShellProps {
  activeTab: AppTab;
  authStatus: AuthStatus;
  authLoading: boolean;
  onLoginSuccess: () => void;
  children: ReactNode;
}

const navItems: Array<{
  value: AppTab;
  label: string;
  description: string;
  path: string;
  icon: typeof MessageSquareText;
}> = [
  {
    value: "messages",
    label: "消息",
    description: "筛选与处理",
    path: "/messages",
    icon: MessageSquareText,
  },
  {
    value: "filters",
    label: "过滤器",
    description: "规则维护",
    path: "/filters",
    icon: ListFilter,
  },
  {
    value: "notifications",
    label: "通知",
    description: "转发通道",
    path: "/notifications",
    icon: BellRing,
  },
  {
    value: "settings",
    label: "设置",
    description: "系统配置",
    path: "/settings",
    icon: Settings,
  },
];

export function AppShell({ activeTab, authStatus, authLoading, onLoginSuccess, children }: AppShellProps) {
  const navigate = useNavigate();

  const handleNavigate = useCallback(
    (item: (typeof navItems)[number]) => {
      if (item.value !== activeTab) navigate(item.path);
    },
    [activeTab, navigate],
  );

  if (authLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
        <div className="app-workspace-surface pointer-events-none absolute inset-0" />
        <div className="relative flex items-center gap-3 rounded-lg border border-border/70 bg-card/90 px-4 py-3 text-muted-foreground shadow-sm">
          <div className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm font-medium">正在连接工作台...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="app-workspace-surface pointer-events-none absolute inset-0" />

      {!authStatus.authorized && <TelegramLogin authStatus={authStatus} onLoginSuccess={onLoginSuccess} />}

      <div className="relative z-10 flex h-screen min-h-0 overflow-hidden">
        <aside className="hidden w-[228px] shrink-0 bg-sidebar/88 shadow-[1px_0_0_color-mix(in_oklab,var(--sidebar-border)_34%,transparent)] backdrop-blur-xl md:flex md:flex-col">
          <div className="flex h-16 items-center gap-3 px-4 shadow-[0_1px_0_color-mix(in_oklab,var(--sidebar-border)_30%,transparent)]">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight">Telegram Star</h1>
              <p className="text-xs text-muted-foreground">Message workspace</p>
            </div>
          </div>

          <nav className="flex h-auto w-full flex-col items-stretch gap-1 p-3" aria-label="主导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.value === activeTab;

              return (
                <button
                  type="button"
                  key={item.value}
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleNavigate(item)}
                  className={cn(
                    "group flex w-full items-center justify-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-all",
                    "border-transparent text-sidebar-foreground/68 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    active && "border-primary/25 bg-primary/10 text-sidebar-foreground shadow-sm",
                  )}
                >
                  <Icon className="size-4 text-current" />
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="text-sm font-medium leading-none">{item.label}</span>
                    <span className="text-[11px] font-normal leading-none text-muted-foreground">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto p-3">
            <div className="rounded-lg bg-background/68 px-3 py-2 shadow-sm ring-1 ring-sidebar-border/45">
              <p className="text-xs font-medium">运行状态</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", authStatus.authorized ? "bg-success" : "bg-warning")} />
                {authStatus.authorized ? "已连接 Telegram" : "等待登录"}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 bg-background/88 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_34%,transparent)] backdrop-blur-md md:hidden">
            <div className="flex h-14 items-center gap-3 px-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="size-4" />
              </div>
              <nav
                className="flex min-w-0 flex-1 justify-start gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="主导航"
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.value === activeTab;

                  return (
                    <button
                      type="button"
                      key={item.value}
                      aria-current={active ? "page" : undefined}
                      onClick={() => handleNavigate(item)}
                      className={cn(
                        "relative flex h-14 flex-none items-center gap-1.5 px-1 text-sm font-medium text-foreground/58 transition-colors sm:px-3",
                        "hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        active && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-auto md:overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
