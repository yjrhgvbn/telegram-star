import type { ReactNode } from "react";
import { BellRing, Rows3, Waypoints } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TelegramLogin } from "@/components/TelegramLogin";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuthStatus } from "@/types";

interface AppShellProps {
  activeTab: "filtered" | "groups" | "notifications";
  authStatus: AuthStatus;
  authLoading: boolean;
  onLoginSuccess: () => void;
  children: ReactNode;
}

export function AppShell({ activeTab, authStatus, authLoading, onLoginSuccess, children }: AppShellProps) {
  const navigate = useNavigate();

  const handleTabChange = useCallback(
    (value: string) => {
      if (value === "filtered") {
        navigate("/messages");
      }

      if (value === "groups") {
        navigate("/groups");
      }

      if (value === "notifications") {
        navigate("/notifications");
      }
    },
    [navigate],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm">连接中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.12),transparent_45%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.15),transparent_42%),radial-gradient(circle_at_60%_85%,rgba(251,146,60,0.12),transparent_46%)]" />

      {!authStatus.authorized && <TelegramLogin authStatus={authStatus} onLoginSuccess={onLoginSuccess} />}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="relative z-10 h-screen flex-col gap-0 flex overflow-scroll">
        <header className="sticky top-0 z-20 border-border/60 bg-background/80 backdrop-blur-md">
          <div className="px-4 sm:px-6 flex h-16 items-center gap-8">
            <h1 className="hidden py-4 text-lg font-semibold tracking-tight sm:block">Telegram Star</h1>
            <div className="flex flex-col pt-3">
              <TabsList
                variant="line"
                className="w-full justify-start gap-3 overflow-x-auto rounded-none border-none bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <TabsTrigger
                  value="filtered"
                  className="flex-none rounded-none px-1 pb-3 text-sm font-medium text-foreground/58 data-active:text-foreground sm:px-3"
                >
                  <Rows3 data-icon="inline-start" />
                  过滤的消息
                </TabsTrigger>
                <TabsTrigger
                  value="groups"
                  className="flex-none rounded-none px-1 pb-3 text-sm font-medium text-foreground/58 data-active:text-foreground sm:px-3"
                >
                  <Waypoints data-icon="inline-start" />
                  群组列表
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="flex-none rounded-none px-1 pb-3 text-sm font-medium text-foreground/58 data-active:text-foreground sm:px-3"
                >
                  <BellRing data-icon="inline-start" />
                  通知设置
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </header>

        {children}
      </Tabs>
    </div>
  );
}
