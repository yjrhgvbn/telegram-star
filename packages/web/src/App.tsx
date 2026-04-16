import { useState, useEffect, useCallback } from "react";
import { LogOut, Menu, RefreshCw, Search, Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { api } from "./api/client";
import { useMessages, useStats } from "./hooks/useMessages";
import { useFilters } from "./hooks/useFilters";
import { TelegramLogin } from "./components/TelegramLogin";
import { FilterPanel } from "./components/FilterPanel";
import { MessageList } from "./components/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuthStatus } from "./types";

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    connected: false,
    authorized: false,
    waitingForCode: false,
    waitingForPassword: false,
  });
  const [authLoading, setAuthLoading] = useState(true);

  // Filters
  const [selectedFilterId, setSelectedFilterId] = useState("");
  const [readFilter, setReadFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { filters, loading: filtersLoading, createFilter, deleteFilter, toggleFilter } = useFilters();
  const { messages, pagination, loading: messagesLoading, toggleRead, refresh } = useMessages({
    page,
    limit: 20,
    isRead: readFilter,
    filterId: selectedFilterId,
    search: searchQuery,
  });
  const { stats } = useStats();

  // Check auth status on mount
  useEffect(() => {
    api.auth
      .status()
      .then(setAuthStatus)
      .catch(() => {
        // If API is not available, still show login
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setAuthStatus((prev) => ({ ...prev, connected: true, authorized: true }));
  }, []);

  const handleLogout = useCallback(async () => {
    await api.auth.logout();
    setAuthStatus({ connected: false, authorized: false, waitingForCode: false, waitingForPassword: false });
  }, []);

  const handleCreateFilter = useCallback(
    async (data: { name: string; type: string; value: string }) => {
      await createFilter(data);
    },
    [createFilter]
  );

  const handleSearch = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
    refresh();
  }, [refresh]);

  // Auto-refresh messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

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

      {/* Login overlay */}
      {!authStatus.authorized && (
        <TelegramLogin authStatus={authStatus} onLoginSuccess={handleLoginSuccess} />
      )}

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-y-0 right-0 z-20 bg-black/40 backdrop-blur-[1px] md:hidden"
          style={{ left: "min(320px, 100vw)" }}
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭侧栏"
        />
      )}

      <div className="relative z-10 flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex h-screen flex-col border-r border-border/60 bg-card/85 backdrop-blur-xl transition-all duration-300 md:sticky md:top-0",
            sidebarOpen ? "w-[320px] translate-x-0" : "w-0 -translate-x-full overflow-hidden border-transparent md:translate-x-0"
          )}
        >
          <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-lg">⭐</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Telegram Star</p>
              <p className="text-xs text-muted-foreground">更友好的消息追踪台</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="折叠侧栏"
            >
              {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>
          </div>

          <FilterPanel
            filters={filters}
            loading={filtersLoading}
            onCreateFilter={handleCreateFilter}
            onDeleteFilter={deleteFilter}
            onToggleFilter={toggleFilter}
            selectedFilterId={selectedFilterId}
            onSelectFilter={(id) => { setSelectedFilterId(id); setPage(1); }}
          />

          {authStatus.authorized && (
            <div className="border-t border-border/70 p-3">
              <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
                <LogOut data-icon="inline-start" />
                退出登录
              </Button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col md:ml-0">
          {/* Header */}
          <header className="sticky top-0 z-10 border-b border-border/60 bg-background/70 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  <Menu />
                </Button>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">消息追踪</h1>
                  <p className="text-xs text-muted-foreground">专注于真正重要的 Telegram 消息</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-7 rounded-full px-3 text-xs">总消息 {stats.total}</Badge>
                <Badge className="h-7 rounded-full px-3 text-xs">未读 {stats.unread}</Badge>
                <Badge variant="outline" className="hidden h-7 rounded-full px-3 text-xs sm:inline-flex">今日 {stats.today}</Badge>
              </div>
            </div>
          </header>

          {/* Toolbar */}
          <div className="border-b border-border/60 bg-background/55 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <form className="min-w-55 flex-1" onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    className="h-9 rounded-full bg-card/70 pr-10 pl-9"
                    placeholder="搜索消息内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={() => { setSearchQuery(""); setPage(1); }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </form>

              <div className="flex items-center gap-2 rounded-full bg-card/70 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => { setReadFilter(""); setPage(1); }}
                >
                  全部
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "false" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => { setReadFilter("false"); setPage(1); }}
                >
                  未读
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "true" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => { setReadFilter("true"); setPage(1); }}
                >
                  已读
                </Button>
              </div>

              <Button type="button" variant="outline" size="icon" onClick={refresh} title="刷新">
                <RefreshCw className={cn(messagesLoading && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" />
              <span>智能排序已开启，最新匹配消息优先展示</span>
            </div>
            <MessageList
              messages={messages}
              pagination={pagination}
              loading={messagesLoading}
              onToggleRead={toggleRead}
              onPageChange={setPage}
              searchQuery={searchQuery}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
