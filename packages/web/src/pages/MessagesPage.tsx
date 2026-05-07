import { useState, useEffect, useCallback } from "react";
import { LogOut, RefreshCw, Search, Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useMessages, useStats } from "@/hooks/useMessages";
import { useFilters } from "@/hooks/useFilters";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { AppShell } from "@/components/AppShell";
import { FilterPanel } from "@/components/FilterPanel";
import { MessageList } from "@/components/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MessagesPage() {
  const { authStatus, authLoading, handleLoginSuccess, handleLogout } = useAuthStatus();

  const [selectedFilterId, setSelectedFilterId] = useState("");
  const [readFilter, setReadFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { filters, loading: filtersLoading } = useFilters();
  const { messages, pagination, loading: messagesLoading, toggleRead, refresh } = useMessages({
    page,
    limit: 20,
    isRead: readFilter,
    filterId: selectedFilterId,
    search: searchQuery,
  });
  useStats();

  const handleSearch = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setPage(1);
      refresh();
    },
    [refresh]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <AppShell
      activeTab="filtered"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="mt-0 flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden border-r border-border/60 bg-card/85 backdrop-blur-xl md:flex md:flex-col",
            sidebarOpen ? "md:w-[320px]" : "md:w-18"
          )}
        >
          <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-lg">⭐</div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Telegram Star</p>
                <p className="text-xs text-muted-foreground">更友好的消息追踪台</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="折叠侧栏"
            >
              {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>
          </div>

          {sidebarOpen && (
            <>
              <FilterPanel
                filters={filters}
                loading={filtersLoading}
                selectedFilterId={selectedFilterId}
                onSelectFilter={(id) => {
                  setSelectedFilterId(id);
                  setPage(1);
                }}
              />

              {authStatus.authorized && (
                <div className="border-t border-border/70 p-3">
                  <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
                    <LogOut data-icon="inline-start" />
                    退出登录
                  </Button>
                </div>
              )}
            </>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
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
                      onClick={() => {
                        setSearchQuery("");
                        setPage(1);
                      }}
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
                  onClick={() => {
                    setReadFilter("");
                    setPage(1);
                  }}
                >
                  全部
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "false" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => {
                    setReadFilter("false");
                    setPage(1);
                  }}
                >
                  未读
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "true" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => {
                    setReadFilter("true");
                    setPage(1);
                  }}
                >
                  已读
                </Button>
              </div>

              <Button type="button" variant="outline" size="icon" onClick={refresh} title="刷新">
                <RefreshCw className={cn(messagesLoading && "animate-spin")} />
              </Button>
            </div>
          </div>

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
    </AppShell>
  );
}
