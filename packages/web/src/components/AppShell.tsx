import type { ReactNode } from "react";
import { ListFilter, LoaderCircle, MessageSquareText, Send, Settings } from "lucide-react";
import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TelegramLogin } from "@/components/TelegramLogin";
import { cn } from "@/lib/utils";
import type { AuthStatus } from "@/types";
import { useWorkspaceHistoryGuard, type WorkspaceNavigationGuard } from "./WorkspaceHistoryGuard";
import "./AppShell.css";
import { isDemo } from "@/demo/mode";
import { DemoBanner } from "@/demo/DemoBanner";

type AppTab = "messages" | "filters" | "notifications" | "settings";

interface AppShellProps {
  activeTab: AppTab;
  authStatus: AuthStatus;
  authLoading: boolean;
  onLoginSuccess: () => void;
  onNavigateRequest?: (action: () => void, destination?: string) => void;
  navigationGuard?: WorkspaceNavigationGuard;
  children: ReactNode;
}

const navItems = [
  { value: "messages", label: "消息", path: "/messages", icon: MessageSquareText },
  { value: "filters", label: "规则", path: "/filters", icon: ListFilter },
  { value: "notifications", label: "转发", path: "/notifications", icon: Send },
  { value: "settings", label: "设置", path: "/settings", icon: Settings },
] as const;

export function AppShell({ activeTab, authStatus, authLoading, onLoginSuccess, onNavigateRequest, navigationGuard, children }: AppShellProps) {
  useWorkspaceHistoryGuard(navigationGuard);
  const navigate = useNavigate();
  const handleNavigate = useCallback((item: (typeof navItems)[number]) => {
    // Settings categories keep their drafts mounted when returning to the category list.
    if (item.value === "settings" && activeTab === "settings") {
      navigate(item.path);
      return;
    }
    // Re-selecting a list/detail tab also returns a mobile detail to its list.
    if (item.value !== activeTab || item.value === "messages" || item.value === "filters" || item.value === "notifications") {
      if (onNavigateRequest) onNavigateRequest(() => navigate(item.path), item.path);
      else navigate(item.path);
    }
  }, [activeTab, navigate, onNavigateRequest]);

  return (
    <div className={cn("app-layout", isDemo && "app-layout--demo", activeTab === "messages" && "message-theme", activeTab === "filters" && "rules-theme", activeTab === "notifications" && "forward-theme", activeTab === "settings" && "settings-theme")}>
      {isDemo && <DemoBanner />}
      {authLoading ? (
        <div className="app-layout__loading" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          <span>正在连接</span>
        </div>
      ) : (
        <>
          {!isDemo && !authStatus.authorized && <TelegramLogin authStatus={authStatus} onLoginSuccess={onLoginSuccess} />}
          <header className="app-layout__header">
            <Link className="app-layout__brand" to="/messages" aria-label="Telegram Star 消息首页" onClick={(event) => {
              if (onNavigateRequest && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                onNavigateRequest(() => navigate("/messages"), "/messages");
              }
            }}>
              <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="34" height="34" />
              <span>Telegram Star</span>
            </Link>
            <nav className="app-navigation" aria-label="主导航">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-current={item.value === activeTab ? "page" : undefined}
                    onClick={() => handleNavigate(item)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </header>
          <div className="app-layout__body">{children}</div>
        </>
      )}
    </div>
  );
}
