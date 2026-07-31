import type { ReactNode } from "react";
import { BellRing, ListFilter, LoaderCircle, MessageSquareText, Settings } from "lucide-react";
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
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background">
        <div className="app-workspace-surface pointer-events-none absolute inset-0" />
        <div className="relative flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-muted-foreground shadow-sm">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          <p className="text-sm font-medium">正在连接工作台</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="app-workspace-surface pointer-events-none absolute inset-0" />

      {!authStatus.authorized && <TelegramLogin authStatus={authStatus} onLoginSuccess={onLoginSuccess} />}

      <div className="relative z-10 flex h-dvh min-h-0 overflow-hidden">
        <aside className="hidden w-[72px] shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
          <div className="flex h-13 items-center justify-center">
            <img
              src="/icons/icon.svg"
              alt=""
              className="size-8 rounded-lg shadow-sm"
            />
          </div>

          <nav className="flex w-full flex-col items-stretch gap-1.5 p-2" aria-label="主导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.value === activeTab;

              return (
                <button
                  type="button"
                  key={item.value}
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleNavigate(item)}
                  title={item.description}
                  className={cn(
                    "group relative flex h-13 w-full flex-col items-center justify-center gap-1 rounded-lg text-sidebar-foreground/64 transition-colors",
                    "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                    active && "bg-card text-sidebar-accent-foreground shadow-[0_4px_14px_color-mix(in_oklab,var(--foreground)_6%,transparent)] ring-1 ring-sidebar-border",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-transparent",
                      active && "bg-primary",
                    )}
                    aria-hidden
                  />
                  <Icon className="size-[18px] text-current" />
                  <span className="text-[11px] font-medium leading-none">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0">
          <div className="app-mobile-viewport flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>

          <nav
            className="app-mobile-nav fixed inset-x-0 z-40 grid shrink-0 grid-cols-4 border-t border-border bg-card px-1 md:hidden"
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
                    "relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors",
                    "hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/45",
                    active && "text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-transparent",
                      active && "bg-primary",
                    )}
                    aria-hidden
                  />
                  <Icon className="size-[18px]" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
